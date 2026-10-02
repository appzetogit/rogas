/**
 * Field-level encryption (Amendment v2 Extra, Gap N): values are stored encrypted and every read path hands back
 * plaintext. Needs a LOCAL MongoDB:  AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27017 node --test tests/fieldEncryption.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connect, disconnect } from './helpers/amendmentFixtures.mjs';

let FoodUser;
let FoodDeliveryPartner;
let FleetPartner;
const ENC = /^enc:v1:/;

before(async () => {
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    await connect('field_encryption');
    ({ FoodUser } = await import('../src/core/users/user.model.js'));
    ({ FoodDeliveryPartner } = await import('../src/modules/food/delivery/models/deliveryPartner.model.js'));
    ({ FleetPartner } = await import('../src/modules/dailymealbox/vendor/fleetPartner.model.js'));
});
after(disconnect);

const address = (street) => ({ label: 'Home', street, city: 'Warszawa', state: 'Mazowieckie', zipCode: '00-001', phone: '+48500100200', additionalDetails: 'Flat 4' });

test('addresses are stored encrypted and read back as plaintext (hydrated, toJSON, lean)', async () => {
    const user = await FoodUser.create({ phone: '+48500000001', name: 'Anna', addresses: [address('Marszałkowska 1')] });
    const raw = await mongoose.connection.collection('food_users').findOne({ _id: user._id });
    for (const f of ['street', 'zipCode', 'phone', 'additionalDetails']) assert.match(raw.addresses[0][f], ENC, f);
    assert.equal(raw.addresses[0].city, 'Warszawa');
    assert.equal(raw.phone, '+48500000001');

    const hydrated = await FoodUser.findById(user._id);
    assert.equal(hydrated.addresses[0].street, 'Marszałkowska 1');
    assert.equal(hydrated.toJSON().addresses[0].street, 'Marszałkowska 1');
    assert.equal(hydrated.toObject().addresses[0].zipCode, '00-001');
    assert.equal(JSON.parse(JSON.stringify(hydrated)).addresses[0].phone, '+48500100200');
    assert.equal(hydrated.toJSON().id, undefined, 'no virtuals added to API output');

    const lean = await FoodUser.findById(user._id).lean();
    assert.equal(lean.addresses[0].street, 'Marszałkowska 1');
    const many = await FoodUser.find({ _id: user._id }).select('addresses').lean();
    assert.equal(many[0].addresses[0].additionalDetails, 'Flat 4');
});

test('subdocument edits, $push and positional updates stay encrypted', async () => {
    const user = await FoodUser.create({ phone: '+48500000002', addresses: [address('Old 1')] });
    const doc = await FoodUser.findById(user._id);
    doc.addresses[0].street = 'New 2';
    doc.addresses.push(address('Second 3'));
    await doc.save();
    await FoodUser.updateOne({ _id: user._id }, { $push: { addresses: address('Third 4') } });
    await FoodUser.updateOne({ _id: user._id, 'addresses._id': doc.addresses[0]._id }, { $set: { 'addresses.$.street': 'Fourth 5' } });
    const raw = await mongoose.connection.collection('food_users').findOne({ _id: user._id });
    assert.equal(raw.addresses.length, 3);
    raw.addresses.forEach((a) => assert.match(a.street, ENC));
    const updated = await FoodUser.findOneAndUpdate({ _id: user._id }, { $set: { name: 'X' } }, { new: true }).lean();
    assert.deepEqual(updated.addresses.map((a) => a.street), ['Fourth 5', 'Second 3', 'Third 4']);
});

test('bank fields: create, findOneAndUpdate, populate and aggregate return plaintext', async () => {
    const fleet = await FleetPartner.create({ companyName: 'Fleet', city: 'Warszawa', bankIban: 'PL61109010140000071219812874' });
    const driver = await FoodDeliveryPartner.create({ name: 'Jan', phone: '+48500000003', bankAccountNumber: '12345678', fleetPartnerId: fleet._id });
    await FoodDeliveryPartner.findOneAndUpdate({ _id: driver._id }, { $set: { bankIban: 'PL27114020040000300201355387' } });
    const raw = await mongoose.connection.collection('food_delivery_partners').findOne({ _id: driver._id });
    assert.match(raw.bankAccountNumber, ENC);
    assert.match(raw.bankIban, ENC);

    const populated = await FoodDeliveryPartner.findById(driver._id).populate('fleetPartnerId', 'bankIban').lean();
    assert.equal(populated.bankIban, 'PL27114020040000300201355387');
    assert.equal(populated.fleetPartnerId.bankIban, 'PL61109010140000071219812874');

    const [agg] = await FoodDeliveryPartner.aggregate([{ $match: { _id: driver._id } }, { $project: { bankAccountNumber: 1 } }]);
    assert.equal(agg.bankAccountNumber, '12345678');
});

test('migration encrypts plaintext already in the database, is idempotent, and plaintext stays readable meanwhile', async () => {
    const { encryptExistingValues } = await import('../src/utils/encryptedFields.plugin.js');
    const coll = mongoose.connection.collection('food_users');
    const { insertedId } = await coll.insertOne({ phone: '+48500000004', addresses: [
        { _id: new mongoose.Types.ObjectId(), label: 'Home', street: 'Legacy 1', city: 'W', state: 'M', zipCode: '00-002', phone: '', additionalDetails: '' },
        { _id: new mongoose.Types.ObjectId(), label: 'Office', street: 'Legacy 2', city: 'W', state: 'M', zipCode: '', phone: '', additionalDetails: '' }
    ] });
    const before = await FoodUser.findById(insertedId).lean();
    assert.equal(before.addresses[0].street, 'Legacy 1', 'legacy plaintext is readable');

    const paths = ['addresses.street', 'addresses.additionalDetails', 'addresses.zipCode', 'addresses.phone'];
    const first = await encryptExistingValues(FoodUser, paths);
    assert.ok(first.updated >= 1);
    const raw = await coll.findOne({ _id: insertedId });
    assert.match(raw.addresses[0].street, ENC);
    assert.match(raw.addresses[1].street, ENC);
    assert.equal(raw.addresses[1].zipCode, '', 'empty values stay empty');
    const second = await encryptExistingValues(FoodUser, paths);
    assert.equal(second.updated, 0);
    const after = await FoodUser.findById(insertedId).lean();
    assert.deepEqual(after.addresses.map((a) => a.street), ['Legacy 1', 'Legacy 2']);
});

test('security status reports coverage without leaking values', async () => {
    const { securityStatus } = await import('../src/modules/dailymealbox/platform/security.js');
    const status = await securityStatus();
    assert.equal(status.fieldLevel.key.primaryKeyConfigured, true);
    const users = status.fieldLevel.coverage.find((c) => c.model === 'FoodUser');
    const street = users.fields.find((f) => f.path === 'addresses.street');
    assert.equal(street.plaintext, 0);
    assert.ok(street.encrypted >= 4);
    assert.ok(!JSON.stringify(status).includes(process.env.PII_ENCRYPTION_KEY));
});

test('key rotation: old values stay readable with PII_ENCRYPTION_KEY_PREVIOUS and the migration moves them to the new key', async () => {
    const { encryptExistingValues } = await import('../src/utils/encryptedFields.plugin.js');
    const { activeKeyId, encryptField } = await import('../src/utils/fieldCrypto.js');
    const coll = mongoose.connection.collection('food_users');
    const paths = ['addresses.street', 'addresses.additionalDetails', 'addresses.zipCode', 'addresses.phone', 'whatsappNumber'];
    const keyA = process.env.PII_ENCRYPTION_KEY;
    const keyB = Buffer.alloc(32, 9).toString('base64');
    const kidA = activeKeyId();
    try {
        const user = await FoodUser.create({ phone: '+48500000005', name: 'Rota', addresses: [address('Rotacyjna 5')] });
        // A value written before key fingerprints existed carried the id "p" whatever the primary key was.
        const legacy = encryptField('+48600111222').replace(`enc:v1:${kidA}:`, 'enc:v1:p:');
        await coll.updateOne({ _id: user._id }, { $set: { whatsappNumber: legacy } });
        assert.match((await coll.findOne({ _id: user._id })).addresses[0].street, new RegExp(`^enc:v1:${kidA}:`));

        process.env.PII_ENCRYPTION_KEY = keyB;
        process.env.PII_ENCRYPTION_KEY_PREVIOUS = keyA;
        const kidB = activeKeyId();
        assert.notEqual(kidB, kidA);
        assert.equal((await FoodUser.findById(user._id).lean()).addresses[0].street, 'Rotacyjna 5', 'readable during rotation');
        const { safeDecrypt } = await import('../src/utils/fieldCrypto.js');
        assert.equal(safeDecrypt((await coll.findOne({ _id: user._id })).whatsappNumber), '+48600111222', 'legacy "p" value still decrypts');

        const res = await encryptExistingValues(FoodUser, paths);
        assert.ok(res.updated >= 1);
        const raw = await coll.findOne({ _id: user._id });
        assert.match(raw.addresses[0].street, new RegExp(`^enc:v1:${kidB}:`));
        assert.match(raw.whatsappNumber, new RegExp(`^enc:v1:${kidB}:`));

        delete process.env.PII_ENCRYPTION_KEY_PREVIOUS;
        assert.equal((await FoodUser.findById(user._id).lean()).addresses[0].street, 'Rotacyjna 5', 'readable without the old key');
        assert.equal(safeDecrypt((await coll.findOne({ _id: user._id })).whatsappNumber), '+48600111222');
        assert.equal((await encryptExistingValues(FoodUser, paths)).updated, 0, 'idempotent after rotation');
    } finally {
        process.env.PII_ENCRYPTION_KEY = keyA;
        delete process.env.PII_ENCRYPTION_KEY_PREVIOUS;
    }
});

test('driver identity-document numbers are stored encrypted and read back as plaintext', async () => {
    const d = await FoodDeliveryPartner.create({ name: 'Doc Driver', phone: '+48500000006', drivingLicenseNumber: ' 01234/22/1465 ', aadharNumber: 'ABC123456', panNumber: 'PL-ID-77' });
    const raw = await mongoose.connection.collection('food_delivery_partners').findOne({ _id: d._id });
    for (const f of ['drivingLicenseNumber', 'aadharNumber', 'panNumber']) assert.match(raw[f], ENC, f);
    const lean = await FoodDeliveryPartner.findById(d._id).select('drivingLicenseNumber aadharNumber panNumber').lean();
    assert.equal(lean.drivingLicenseNumber, '01234/22/1465', 'trimmed then encrypted');
    assert.equal(lean.aadharNumber, 'ABC123456');
    const hydrated = await FoodDeliveryPartner.findById(d._id);
    hydrated.panNumber = 'PL-ID-78';
    await hydrated.save();
    assert.equal((await FoodDeliveryPartner.findById(d._id).lean()).panNumber, 'PL-ID-78');
    assert.match((await mongoose.connection.collection('food_delivery_partners').findOne({ _id: d._id })).panNumber, ENC);
});
