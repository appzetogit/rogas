/**
 * A ready pickup is never broadcast to drivers who were not assigned to its zone and slot: online drivers elsewhere (or a
 * vendor without a zone) get nothing and the admin gets a critical alert. Accepted assignments are tested in driverAssignment.test.mjs.
 * Needs a LOCAL MongoDB:   node --test tests/dispatchNoFallback.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, disconnect, seedWorld, nextPhone } from './helpers/amendmentFixtures.mjs';

let w, svc, CollectionBatch, DMBAdminAlert, today;

before(async () => {
    await connect('dispatch_no_fallback_test');
    w = await seedWorld();
    svc = await import('../src/modules/dailymealbox/subscription/dmb.dailyOrder.service.js');
    ({ CollectionBatch } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js'));
    ({ DMBAdminAlert } = await import('../src/modules/dailymealbox/platform/platform.models.js'));
    today = (await import('../src/utils/platformTime.js')).localToday();
});
after(disconnect);

const readyOrder = (vendor) => w.DMBDailyOrder.create({
    orderType: 'subscription', subscriptionId: new (w.DMBSubscription.base.Types.ObjectId)(), userId: w.user._id, vendorId: vendor._id,
    zoneId: vendor.zoneId, meals: [{ name: 'Rosół', quantity: 1 }], deliveryDate: today, deliverySlot: 'lunch', status: 'ready'
});
const driver = (zoneIds, over = {}) => w.FoodDeliveryPartner.create({ name: 'D', phone: nextPhone(), status: 'approved', availabilityStatus: 'online', zoneIds, ...over });

test('online drivers who are not assigned: batch stays unassigned and admin is alerted (no all-driver fallback)', async () => {
    await w.DMBDailyOrder.deleteMany({}); await CollectionBatch.deleteMany({}); await DMBAdminAlert.deleteMany({});
    await driver([w.zone2._id]); // online, but another zone
    await readyOrder(w.vendor);
    await svc.triggerDriverNotificationIfAllReady(w.vendor._id, today, 'lunch');
    const batch = await CollectionBatch.findOne({ vendorId: w.vendor._id });
    assert.ok(batch);
    assert.equal(batch.status, 'pending');
    assert.equal(batch.driverId, null);
    const alert = await DMBAdminAlert.findOne({ type: 'pickup_no_driver' }).lean();
    assert.ok(alert, 'admin alert raised');
    assert.equal(alert.severity, 'critical');
    assert.equal(alert.entityId, String(batch._id));
});

test('a vendor without a zone is never matched to drivers by city or otherwise', async () => {
    await w.DMBDailyOrder.deleteMany({}); await CollectionBatch.deleteMany({}); await DMBAdminAlert.deleteMany({});
    await driver([w.zone._id]);
    await w.FoodRestaurant.updateOne({ _id: w.vendor._id }, { $unset: { zoneId: 1 } });
    const v = await w.FoodRestaurant.findById(w.vendor._id);
    await readyOrder(v);
    await svc.triggerDriverNotificationIfAllReady(v._id, today, 'lunch');
    assert.ok(await DMBAdminAlert.findOne({ type: 'pickup_no_driver' }), 'alerted instead of broadcasting');
    await w.FoodRestaurant.updateOne({ _id: w.vendor._id }, { $set: { zoneId: w.zone._id } });
});
