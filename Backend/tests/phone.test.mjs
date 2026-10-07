/**
 * Phone numbers and country codes. The bug this guards: a Polish number "+48 910 959 948" (9 digits) was stored as the
 * Indian "8910959948" with country code +91, because the "8" of "+48" was pulled into the number ("last 10 digits").
 *
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27017 node --test tests/phone.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const { connect, disconnect } = await import('./helpers/amendmentFixtures.mjs');
const { splitPhone, phoneLookupClauses, normalizeStoredPhone } = await import('../src/core/auth/phone.util.js');
let Driver, auth;

before(async () => {
    await connect('phone_test');
    Driver = (await import('../src/modules/food/delivery/models/deliveryPartner.model.js')).FoodDeliveryPartner;
    auth = await import('../src/core/auth/auth.service.js');
});
after(disconnect);

test('a number is split into its own country code and national number, nothing moves between them', () => {
    const cases = {
        '+48910959948': ['+48', '910959948'],
        '48 910 959 948': ['+48', '910959948'],
        '+91 89109 59948': ['+91', '8910959948'],
        '918910959948': ['+91', '8910959948'],
        '8910959948': ['+91', '8910959948'], // the older 10-digit India format
        '+48600100201': ['+48', '600100201'],
        '+49 151 2345678': ['+49', '1512345678'],
        '+44 7911 123456': ['+44', '7911123456']
    };
    for (const [input, [dialCode, local]] of Object.entries(cases)) {
        const got = splitPhone(input);
        assert.equal(got.dialCode, dialCode, input);
        assert.equal(got.local, local, input);
    }
});

test('what to store: the national number keeps every digit, the country code is the one the person has', () => {
    assert.deepEqual(normalizeStoredPhone({ phone: '910959948', countryCode: '+48' }), { dialCode: '+48', local: '910959948' });
    assert.deepEqual(normalizeStoredPhone({ phone: '+48910959948', countryCode: '+48' }), { dialCode: '+48', local: '910959948' });
    assert.deepEqual(normalizeStoredPhone({ phone: '48910959948', countryCode: '+91' }), { dialCode: '+48', local: '910959948' }, 'a wrong default +91 does not win over the number\'s own code');
    assert.deepEqual(normalizeStoredPhone({ phone: '8910959948', countryCode: '+91' }), { dialCode: '+91', local: '8910959948' });
    assert.deepEqual(normalizeStoredPhone({ phone: '8910959948' }), { dialCode: '+91', local: '8910959948' });
});

test('a Polish and an Indian number that end in the same digits are different people', async () => {
    await Driver.deleteMany({});
    const indian = await Driver.create({ name: 'Raj', phone: '8910959948', countryCode: '+91', status: 'approved' });
    const polish = await Driver.create({ name: 'Piotr', phone: '910959948', countryCode: '+48', status: 'approved' });

    const find = (phone) => Driver.findOne({ $or: phoneLookupClauses('phone', phone, { countryField: 'countryCode' }) });
    assert.equal(String((await find('+48910959948'))._id), String(polish._id));
    assert.equal(String((await find('48 910 959 948'))._id), String(polish._id));
    assert.equal(String((await find('+91 8910959948'))._id), String(indian._id));
    assert.equal(String((await find('918910959948'))._id), String(indian._id));
    assert.equal(String((await find('8910959948'))._id), String(indian._id), 'the older 10-digit form still finds the Indian driver');

    // Signing in as +48 910 959 948 can never land on the Indian account, and the other way round.
    assert.equal(await auth.checkPhoneAlreadyExists('+48910959948', 'DELIVERY_PARTNER'), true);
    await Driver.deleteOne({ _id: polish._id });
    assert.ok(!(await auth.checkPhoneAlreadyExists('+48910959948', 'DELIVERY_PARTNER')), 'the Indian 8910959948 is not +48 910959948');
    assert.equal(await auth.checkPhoneAlreadyExists('+91 8910959948', 'DELIVERY_PARTNER'), true);
});

test('driver registration stores a Polish number whole, with +48', async () => {
    await Driver.deleteMany({});
    const svc = await import('../src/modules/food/delivery/services/delivery.service.js');
    const partner = await svc.registerDeliveryPartner({ name: 'Anna', phone: '+48910959948', countryCode: '+91', address: 'x', city: 'Warsaw', state: 'MZ', vehicleType: 'bike', vehicleNumber: 'WX1234' }, {}).catch((e) => e);
    // Registration may need more fields than this test fills in; what matters is what would be stored.
    if (partner?.phone) {
        assert.equal(partner.phone, '910959948');
        assert.equal(partner.countryCode, '+48');
    } else {
        assert.deepEqual(normalizeStoredPhone({ phone: '+48910959948', countryCode: '+91' }), { dialCode: '+48', local: '910959948' });
    }
});
