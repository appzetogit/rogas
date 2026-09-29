/**
 * Emails around a subscription's own lifecycle (not a payment event): new subscriber (to the vendor) and
 * customer-initiated cancellation (to both the customer and the vendor). The payment-result emails (received,
 * failed, refunded) are covered in tests/payments.test.mjs, since they apply to every purpose, not just
 * subscriptions.
 *
 * Needs a LOCAL MongoDB (default mongodb://127.0.0.1:27017). It creates a throw-away database and drops it
 * afterwards, and refuses to run against anything that is not localhost.
 *
 *   SUBSCRIPTION_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/subscriptionEmails.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const BASE_URI = process.env.SUBSCRIPTION_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE_URI)) {
    throw new Error(`Refusing to run: SUBSCRIPTION_TEST_MONGO_URI must be a plain local mongod (got ${BASE_URI.replace(/\/\/.*@/, '//***@')})`);
}
const DB_NAME = `subscription_emails_test_${Date.now()}`;

let subSvc, emailSvc, emailModels, DMBSubscription, FoodUser, FoodRestaurant;

before(async () => {
    await mongoose.connect(BASE_URI, { dbName: DB_NAME });
    subSvc = await import('../src/modules/dailymealbox/subscription/subscription.service.js');
    emailSvc = await import('../src/modules/email/email.service.js');
    emailModels = await import('../src/modules/email/email.models.js');
    ({ DMBSubscription } = await import('../src/modules/dailymealbox/subscription/subscription.model.js'));
    ({ FoodUser } = await import('../src/core/users/user.model.js'));
    ({ FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js'));
});

after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});

beforeEach(async () => {
    await Promise.all([DMBSubscription.deleteMany({}), FoodUser.deleteMany({}), FoodRestaurant.deleteMany({}), emailModels.EmailLog.deleteMany({})]);
    emailSvc._setTransporterForTests({ sendMail: async () => ({ messageId: 'test' }), verify: async () => true });
});

const makeFixture = async (over = {}) => {
    const user = await FoodUser.create({ email: 'customer@example.test', name: 'Anna', phone: `+48${Math.floor(100000000 + Math.random() * 800000000)}`, ...over.user });
    const vendor = await FoodRestaurant.create({ restaurantName: 'Green Bowl', ownerName: 'Owner', ownerEmail: 'vendor@example.test', pureVegRestaurant: false, ...over.vendor });
    const sub = await DMBSubscription.create({
        subscriptionId: `SUB-${Math.random()}`,
        userId: user._id,
        vendorId: vendor._id,
        duration: 'weekly',
        status: 'pending_payment',
        startDate: new Date(),
        deliverySlot: 'lunch',
        deliveryAddress: { street: '1 Main St', city: 'Warsaw', state: 'Mazovia' },
        pricing: { basePricePerDay: 10, totalPrice: 50 },
        ...over.sub
    });
    return { user, vendor, sub };
};

test('activating a subscription emails the vendor about the new subscriber', async () => {
    const { vendor, sub } = await makeFixture();
    await subSvc.activateSubscription(sub.subscriptionId);

    const log = await emailModels.EmailLog.findOne({ to: 'vendor@example.test', templateKey: 'New Subscriber! 🎉' });
    assert.ok(log, 'the vendor is emailed about the new subscriber');
    assert.equal(String(log.ownerId), String(vendor._id));
});

test('a vendor with no email on file is simply skipped, activation still succeeds', async () => {
    const { sub } = await makeFixture({ vendor: { ownerEmail: '' } });
    const activated = await subSvc.activateSubscription(sub.subscriptionId);
    assert.equal(activated.status, 'active');
});

test('cancelling a subscription emails both the customer and the vendor', async () => {
    const { user, vendor, sub } = await makeFixture();
    await DMBSubscription.updateOne({ _id: sub._id }, { status: 'active' });

    const cancelled = await subSvc.cancelSubscription({ subscriptionId: sub.subscriptionId, userId: user._id, reason: 'Moving city' });
    assert.equal(cancelled.status, 'cancelled');

    const customerLog = await emailModels.EmailLog.findOne({ to: 'customer@example.test', templateKey: 'Your subscription has been cancelled' });
    assert.ok(customerLog, 'the customer is emailed the cancellation confirmation');
    assert.equal(String(customerLog.ownerId), String(user._id));

    const vendorLog = await emailModels.EmailLog.findOne({ to: 'vendor@example.test', templateKey: 'Subscriber Cancelled' });
    assert.ok(vendorLog, 'the vendor is emailed too');
});
