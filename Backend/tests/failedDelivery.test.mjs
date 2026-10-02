/**
 * Driver ownership of deliveries: only the driver who picked a box up can mark it delivered or report it failed
 * (DA-07 "Cannot deliver", Gap P), each only once; a failure needs a photo and "returned to shop" is Pantry-only.
 * Needs a LOCAL MongoDB:  AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27017 node --test tests/failedDelivery.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, disconnect, seedWorld, nextWeekday, nextPhone } from './helpers/amendmentFixtures.mjs';

let w, svc, orders, driverA, driverB;

before(async () => {
    await connect('failed_delivery');
    w = await seedWorld();
    svc = await import('../src/modules/dailymealbox/tracking/failedDelivery.service.js');
    const checkout = await import('../src/modules/dailymealbox/subscription/subscriptionCheckout.service.js');
    const subSvc = await import('../src/modules/dailymealbox/subscription/subscription.service.js');
    const gen = await import('../src/modules/dailymealbox/subscription/orderGeneration.js');
    const time = await import('../src/utils/platformTime.js');
    const slotSvc = await import('../src/modules/dailymealbox/deliverySlot/deliverySlot.service.js');
    await slotSvc.listSlots();

    const start = await nextWeekday(1, 1);
    const { subscription } = await checkout.createPendingSubscription({
        userId: w.user._id,
        input: {
            subscriptionPlanId: String(w.plans.weekMF._id), vendorId: String(w.vendor._id), zoneId: String(w.zone._id),
            meals: [{ mealPlanId: String(w.meal._id), quantity: 1 }], deliverySlots: ['lunch'], startDate: start
        },
        deliveryAddress: w.address
    });
    await subSvc.activateSubscription(subscription.subscriptionId);
    for (let i = 0; i < 4; i++) await gen.generateForDate(time.addDays(new Date(start), i));
    orders = await w.DMBDailyOrder.find({ subscriptionId: subscription._id }).sort({ deliveryDate: 1 });
    assert.ok(orders.length >= 3, "fixture needs three daily orders");

    driverA = await w.FoodDeliveryPartner.create({ name: 'Driver A', phone: nextPhone(), status: 'approved', zoneIds: [w.zone._id] });
    driverB = await w.FoodDeliveryPartner.create({ name: 'Driver B', phone: nextPhone(), status: 'approved', zoneIds: [w.zone._id] });
    // Picked up by driver A (what the collection-PIN pickup does).
    await w.DMBDailyOrder.updateOne({ _id: orders[0]._id }, { $set: { status: 'out_for_delivery', 'dispatch.deliveryPartnerId': driverA._id } });
});
after(disconnect);

const report = (driverId, id, over = {}) =>
    svc.reportFailedDelivery({ driverId, stopType: 'dmb', id: String(id), reason: 'no_one_home', disposition: 'held_by_driver', photoUrl: 'https://res.cloudinary.com/demo/door.jpg', ...over });

test('another driver cannot report a box they are not carrying', async () => {
    await assert.rejects(report(driverB._id, orders[0]._id), (e) => e.statusCode === 403);
});

test('a box nobody has picked up cannot be reported failed', async () => {
    await assert.rejects(report(driverA._id, orders[1]._id), (e) => e.statusCode === 403);
    const untouched = await w.DMBDailyOrder.findById(orders[1]._id).lean();
    assert.notEqual(untouched.status, 'failed');
});

test('a photo is mandatory and "returned to shop" is Pantry-only', async () => {
    await assert.rejects(report(driverA._id, orders[0]._id, { photoUrl: '' }), /photo is required/);
    await assert.rejects(report(driverA._id, orders[0]._id, { disposition: 'returned_to_shop' }), /Pantry Box bags only/);
});

test('the carrying driver reports it: order failed, reason recorded, admin alerted, and only once', async () => {
    const result = await report(driverA._id, orders[0]._id, { disposition: 'returned_to_vendor', note: 'Gate code wrong' });
    assert.deepEqual(result, { type: 'dmb', status: 'failed' });
    const failed = await w.DMBDailyOrder.findById(orders[0]._id).lean();
    assert.equal(failed.status, 'failed');
    assert.equal(failed.failure.reason, 'no_one_home');
    assert.equal(failed.failure.disposition, 'returned_to_vendor');
    assert.equal(String(failed.failure.reportedBy), String(driverA._id));
    const { DMBAdminAlert } = await import('../src/modules/dailymealbox/platform/platform.models.js');
    assert.ok(await DMBAdminAlert.findOne({ type: 'delivery_failed', entityId: failed._id }).lean(), 'admin alert raised');
    await assert.rejects(report(driverA._id, orders[0]._id), /already failed/);
});

test('marking delivered (photo / PIN path): only the carrying driver, only once', async () => {
    const { confirmDelivery } = await import('../src/modules/dailymealbox/delivery/collectionPin.service.js');
    assert.ok(orders[2], 'fixture needs a third daily order');
    const id = String(orders[2]._id);
    await assert.rejects(confirmDelivery({ orderId: id, driverId: driverA._id, method: 'photo', proofPhotoUrl: 'https://x/p.jpg' }), /not assigned to you/, 'nobody picked it up yet');
    await w.DMBDailyOrder.updateOne({ _id: id }, { $set: { status: 'out_for_delivery', 'dispatch.deliveryPartnerId': driverA._id } });
    await assert.rejects(confirmDelivery({ orderId: id, driverId: driverB._id, method: 'photo', proofPhotoUrl: 'https://x/p.jpg' }), /not assigned to you/);
    const delivered = await confirmDelivery({ orderId: id, driverId: driverA._id, method: 'photo', proofPhotoUrl: 'https://x/p.jpg' });
    assert.equal(delivered.status, 'delivered');
    await assert.rejects(confirmDelivery({ orderId: id, driverId: driverA._id, method: 'photo', proofPhotoUrl: 'https://x/p.jpg' }), /already delivered/);
    await assert.rejects(confirmDelivery({ orderId: String(orders[0]._id), driverId: driverA._id, method: 'photo' }), /already failed/, 'a failed box cannot be flipped to delivered');
});
