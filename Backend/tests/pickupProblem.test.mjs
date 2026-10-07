/**
 * Driver "problem at the vendor" (before pickup): a blocking problem stops the collection until admin clears it, a
 * non-blocking one only informs, and admin can let the driver continue or release the driver from the pickup.
 * Needs a LOCAL MongoDB:   node --test tests/pickupProblem.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connect, disconnect, seedWorld, nextPhone } from './helpers/amendmentFixtures.mjs';

let w, svc, CollectionBatch, DMBAdminAlert, driverA, driverB;

const makeBatch = async (driver, over = {}) => {
    // Batches are stored on UTC midnight of the platform's calendar day (like every DailyMealBox date).
    const today = (await import('../src/utils/platformTime.js')).localToday();
    return CollectionBatch.create({
        vendorId: w.vendor._id, driverId: driver?._id || null, deliveryDate: today, deliverySlot: 'lunch', boxCount: 2,
        collectionPinHash: '4321', status: driver ? 'driver_assigned' : 'pending', orderIds: [new mongoose.Types.ObjectId()], ...over
    });
};
before(async () => {
    await connect('pickup_problem_test');
    w = await seedWorld();
    svc = await import('../src/modules/dailymealbox/tracking/pickupProblem.service.js');
    ({ CollectionBatch } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js'));
    ({ DMBAdminAlert } = await import('../src/modules/dailymealbox/platform/platform.models.js'));
    driverA = await w.FoodDeliveryPartner.create({ name: 'Driver A', phone: nextPhone(), status: 'approved' });
    driverB = await w.FoodDeliveryPartner.create({ name: 'Driver B', phone: nextPhone(), status: 'approved' });
});
after(disconnect);

const report = (driver, over = {}) => svc.reportPickupProblem({ driverId: driver._id, vendorId: w.vendor._id, slot: 'lunch', reason: 'order_not_ready', ...over });

test('a blocking problem is stored, blocks the collection and raises a critical alert with the photo', async () => {
    const batch = await makeBatch(driverA);
    const res = await report(driverA, { reason: 'items_missing', photoUrl: 'https://img.example/p.jpg', note: 'No soup' });
    assert.equal(res.blocking, true);
    const fresh = await CollectionBatch.findById(batch._id);
    assert.ok(svc.openBlockingIssue(fresh));
    const alert = await DMBAdminAlert.findOne({ type: 'pickup_problem', entityId: String(batch._id) }).lean();
    assert.equal(alert.severity, 'critical');
    assert.equal(alert.data.photoUrl, 'https://img.example/p.jpg');
    assert.equal(alert.data.reason, 'items_missing');
    await CollectionBatch.deleteMany({});
});

test('a non-blocking problem (order not ready) informs but does not block', async () => {
    const batch = await makeBatch(driverA);
    const res = await report(driverA, { reason: 'order_not_ready' });
    assert.equal(res.blocking, false);
    assert.equal(svc.openBlockingIssue(await CollectionBatch.findById(batch._id)), null);
    const dup = await report(driverA, { reason: 'order_not_ready' });
    assert.equal(dup.alreadyReported, true, 'the same open problem is not raised twice');
    await CollectionBatch.deleteMany({});
});

test('validation: photo for items missing, a note for "other", and only the assigned driver may report', async () => {
    await makeBatch(driverA);
    await assert.rejects(report(driverA, { reason: 'items_missing' }), /photo is required/);
    await assert.rejects(report(driverA, { reason: 'other' }), /Describe the problem/);
    await assert.rejects(report(driverA, { reason: 'nonsense' }), /Choose what the problem is/);
    await assert.rejects(report(driverB, { reason: 'order_not_ready' }), /not assigned to you/);
    await CollectionBatch.deleteMany({});
});

test('admin "resume" lifts the block and closes the alert', async () => {
    const batch = await makeBatch(driverA);
    await report(driverA, { reason: 'vendor_refused' });
    const alert = await DMBAdminAlert.findOne({ type: 'pickup_problem', entityId: String(batch._id) }).lean();
    await svc.resolvePickupProblem({ alertId: alert._id, action: 'resume', adminId: w.admin._id });
    const fresh = await CollectionBatch.findById(batch._id);
    assert.equal(svc.openBlockingIssue(fresh), null);
    assert.equal(String(fresh.driverId), String(driverA._id), 'the same driver keeps the pickup');
    assert.equal((await DMBAdminAlert.findById(alert._id)).status, 'resolved');
    await CollectionBatch.deleteMany({});
});

test('admin "release driver" frees the pickup so the vendor can resend it', async () => {
    const batch = await makeBatch(driverA);
    await report(driverA, { reason: 'vendor_closed', photoUrl: 'https://img.example/closed.jpg' });
    const alert = await DMBAdminAlert.findOne({ type: 'pickup_problem', entityId: String(batch._id) }).lean();
    await svc.resolvePickupProblem({ alertId: alert._id, action: 'release_driver', adminId: w.admin._id });
    const fresh = await CollectionBatch.findById(batch._id);
    assert.equal(fresh.driverId, null);
    assert.equal(fresh.status, 'pending');
    assert.equal(svc.openBlockingIssue(fresh), null);
    await assert.rejects(svc.resolvePickupProblem({ alertId: alert._id, action: 'nope', adminId: w.admin._id }), /Choose what to do/);
});
