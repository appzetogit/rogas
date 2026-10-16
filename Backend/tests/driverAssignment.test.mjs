/**
 * Zone x Slot driver assignment, planned by admin the day before: the planning board, assigning / unassigning drivers,
 * the driver accepting or declining, every alert that can follow, and dispatch using only accepted drivers.
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/driverAssignment.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connect, disconnect, seedWorld, nextPhone, setControl, clearControls } from './helpers/amendmentFixtures.mjs';
const { readCollectionPin } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js');

let w, svc, ShiftRecord, CollectionBatch, DMBAdminAlert, DMBHoliday, tm;
let tomorrow, today, lunch, dinner;

before(async () => {
    await connect('driver_assignment_test');
    w = await seedWorld();
    svc = await import('../src/modules/dailymealbox/delivery/driverAssignment.service.js');
    tm = await import('../src/utils/platformTime.js');
    ({ ShiftRecord } = await import('../src/modules/food/delivery/models/shiftRecord.model.js'));
    ({ CollectionBatch } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js'));
    ({ DMBAdminAlert } = await import('../src/modules/dailymealbox/platform/platform.models.js'));
    ({ DMBPlatformHoliday: DMBHoliday } = await import('../src/modules/dailymealbox/platform/holiday.model.js'));
    today = tm.localToday();
    tomorrow = tm.addDays(today, 1);
    lunch = await w.DeliverySlot.create({ key: 'lunch', name: 'Lunch', startTime: '12:00', endTime: '15:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true, sortOrder: 1 });
    dinner = await w.DeliverySlot.create({ key: 'dinner', name: 'Dinner', startTime: '17:00', endTime: '20:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true, sortOrder: 2 });
});
after(disconnect);

beforeEach(async () => {
    const { PantryOrder } = await import('../src/modules/food/restaurant/models/pantryOrder.model.js');
    await Promise.all([PantryOrder.deleteMany({}), ShiftRecord.deleteMany({}), CollectionBatch.deleteMany({}), DMBAdminAlert.deleteMany({}), w.DMBDailyOrder.deleteMany({}), w.FoodDeliveryPartner.deleteMany({})]);
    await clearControls();
});

const ymd = (d) => tm.storageDateStr(d);
const driver = (zones = [w.zone._id], over = {}) => w.FoodDeliveryPartner.create({ name: `Driver ${Math.random().toString(36).slice(2, 6)}`, phone: nextPhone(), status: 'approved', zoneIds: zones, primaryZoneId: zones[0], ...over });
const order = (over = {}) => w.DMBDailyOrder.create({
    orderType: 'subscription', subscriptionId: new mongoose.Types.ObjectId(), userId: w.user._id, vendorId: w.vendor._id, zoneId: w.zone._id,
    meals: [{ name: 'Rosół', quantity: 2 }], deliveryDate: tomorrow, deliverySlot: 'lunch', status: 'scheduled', ...over
});
const assign = (d, over = {}) => svc.assignDriver({ date: ymd(tomorrow), zoneId: w.zone._id, slotKey: 'lunch', driverId: d._id, adminId: w.admin._id, ...over });
const cellOf = (board, zoneId, slotKey) => board.cells.find((c) => String(c.zoneId) === String(zoneId) && c.slotKey === slotKey);

test('the board shows every active zone x shift with orders, tiffins and a status per cell', async () => {
    await order(); await order({ meals: [{ name: 'A', quantity: 1 }] });
    await order({ deliverySlot: 'dinner' });
    await order({ status: 'skipped' }); // a skipped order is no work
    const board = await svc.planningBoard(ymd(tomorrow));
    assert.deepEqual(board.slots.map((s) => s.key), ['lunch', 'dinner']);
    const l = cellOf(board, w.zone._id, 'lunch');
    assert.equal(l.orders, 2);
    assert.equal(l.tiffins, 3);
    assert.equal(l.status, 'uncovered');
    assert.equal(cellOf(board, w.zone._id, 'dinner').orders, 1);
    assert.equal(cellOf(board, w.zone2._id, 'lunch').status, 'idle', 'a cell with no work and no driver is idle');
    assert.equal(board.totals.uncovered, 2);
});

test('orders without a zone are reported separately, never silently dropped into a cell', async () => {
    await order({ zoneId: null });
    const board = await svc.planningBoard(ymd(tomorrow));
    assert.equal(board.unzoned.orders, 1);
    assert.equal(board.totals.orders, 0);
});

test('paid pantry bags count as work in the zone of their shop', async () => {
    const { PantryOrder } = await import('../src/modules/food/restaurant/models/pantryOrder.model.js');
    const po = await PantryOrder.collection.insertOne({
        orderId: 'PO-T1', userId: w.user._id, vendorId: w.vendor._id, status: 'paid', items: [],
        dailyDeliveries: [{ _id: new mongoose.Types.ObjectId(), date: tomorrow, slot: 'lunch', status: 'scheduled' }]
    });
    assert.ok(po.insertedId);
    const board = await svc.planningBoard(ymd(tomorrow));
    assert.equal(cellOf(board, w.zone._id, 'lunch').bags, 1);
    assert.equal(cellOf(board, w.zone._id, 'lunch').status, 'uncovered');
});

test('assigning creates a pending assignment; two drivers can share a cell; the board shows them awaiting', async () => {
    await order();
    const a = await driver(); const b = await driver();
    const r1 = await assign(a); await assign(b);
    assert.equal(r1.shift.assignment.state, 'pending');
    assert.equal(r1.shift.status, 'scheduled');
    assert.ok(r1.shift.assignment.respondBy > new Date());
    const cell = cellOf(await svc.planningBoard(ymd(tomorrow)), w.zone._id, 'lunch');
    assert.equal(cell.assignments.length, 2);
    assert.equal(cell.status, 'awaiting');
    assert.equal((await assign(a)).created, false, 'assigning the same driver again is idempotent');
});

test('the response deadline never passes the slot start, and comes from the admin control', async () => {
    const d = await driver();
    await setControl('driverAssignment', { responseHours: 3 });
    const { shift } = await assign(d);
    const hours = (shift.assignment.respondBy - shift.assignment.assignedAt) / 3_600_000;
    assert.ok(Math.abs(hours - 3) < 0.01);
    // assigned 1h before the slot: the deadline is capped at the slot start
    const slotStart = tm.zonedInstant(ymd(tomorrow), '12:00');
    const nearNow = new Date(slotStart.getTime() - 3_600_000);
    const d2 = await driver();
    const { shift: s2 } = await assign(d2, { now: nearNow });
    assert.equal(s2.assignment.respondBy.getTime(), slotStart.getTime());
});

test('guards: unauthorised zone, double booking another zone, started slot, wrong day, linked slot, holiday, unknown slot', async () => {
    const southOnly = await driver([w.zone2._id]);
    await assert.rejects(assign(southOnly), /not authorised for this zone/);

    const d = await driver([w.zone._id, w.zone2._id]);
    await assign(d);
    await assert.rejects(assign(d, { zoneId: w.zone2._id }), /already assigned to/);

    const late = tm.zonedInstant(ymd(tomorrow), '13:00');
    await assert.rejects(assign(await driver(), { now: late }), /already started/);

    await assert.rejects(assign(await driver(), { slotKey: 'brunch' }), /Slot not found/);

    await w.DeliverySlot.create({ key: 'late_lunch', name: 'Late lunch', startTime: '14:00', endTime: '16:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true, linkedShiftKey: 'lunch' });
    await assert.rejects(assign(await driver(), { slotKey: 'late_lunch' }), /covered by the lunch shift/);

    const dow = tomorrow.getUTCDay();
    await w.DeliverySlot.updateOne({ key: 'dinner' }, { $set: { availableDays: [(dow + 1) % 7] } });
    await assert.rejects(assign(await driver(), { slotKey: 'dinner' }), /does not run on that day/);
    await w.DeliverySlot.updateOne({ key: 'dinner' }, { $set: { availableDays: [0, 1, 2, 3, 4, 5, 6] } });

    await DMBHoliday.create({ name: 'Test holiday', date: tomorrow, status: 'confirmed', scope: 'all' });
    const hol = await DMBHoliday.findOne({ name: 'Test holiday' });
    assert.ok(hol);
    (await import('../src/modules/dailymealbox/platform/holiday.service.js')).invalidateHolidayCache();
    await assert.rejects(assign(await driver(), { slotKey: 'dinner' }), /platform holiday/);
    await DMBHoliday.deleteMany({});
    (await import('../src/modules/dailymealbox/platform/holiday.service.js')).invalidateHolidayCache();
});

test('accepting makes the shift confirmed and the cell covered; only then may dispatch use the driver', async () => {
    await order();
    const d = await driver();
    const { shift } = await assign(d);
    assert.deepEqual(await svc.acceptedDriversFor({ zoneId: w.zone._id, date: ymd(tomorrow), slotKey: 'lunch' }), [], 'pending is not enough');
    const done = await svc.respondToAssignment(d._id, shift._id, { accept: true });
    assert.equal(done.status, 'confirmed');
    assert.equal(done.assignment.state, 'accepted');
    assert.deepEqual((await svc.acceptedDriversFor({ zoneId: w.zone._id, date: ymd(tomorrow), slotKey: 'lunch' })).map(String), [String(d._id)]);
    assert.equal(cellOf(await svc.planningBoard(ymd(tomorrow)), w.zone._id, 'lunch').status, 'covered');
    await assert.rejects(svc.respondToAssignment(d._id, shift._id, { accept: false }), /already accepted/);
});

test('declining raises a critical admin alert with the reason and reopens the cell', async () => {
    await order();
    const d = await driver();
    const { shift } = await assign(d);
    const done = await svc.respondToAssignment(d._id, shift._id, { accept: false, reason: 'Sick' });
    assert.equal(done.assignment.state, 'declined');
    assert.equal(done.status, 'declined');
    const alert = await DMBAdminAlert.findOne({ type: 'assignment_declined' }).lean();
    assert.equal(alert.severity, 'critical');
    assert.match(alert.message, /Sick/);
    assert.equal(alert.data.slotKey, 'lunch');
    assert.equal(cellOf(await svc.planningBoard(ymd(tomorrow)), w.zone._id, 'lunch').status, 'uncovered');
    // admin can ask the same driver again (or another one)
    assert.equal((await assign(d)).shift.assignment.state, 'pending');
});

test('only the assigned driver can answer, and not after the deadline', async () => {
    const d = await driver(); const other = await driver();
    const { shift } = await assign(d);
    await assert.rejects(svc.respondToAssignment(other._id, shift._id, { accept: true }), /not found/);
    const afterDeadline = new Date(shift.assignment.respondBy.getTime() + 1000);
    await assert.rejects(svc.respondToAssignment(d._id, shift._id, { accept: true }, afterDeadline), /time to answer/);
});

test('sweep: an unanswered assignment expires with an alert, once', async () => {
    const d = await driver();
    const { shift } = await assign(d);
    const later = new Date(shift.assignment.respondBy.getTime() + 60_000);
    const first = await svc.sweepAssignments(later);
    assert.equal(first.expired, 1);
    const fresh = await ShiftRecord.findById(shift._id);
    assert.equal(fresh.assignment.state, 'expired');
    assert.equal(fresh.status, 'expired');
    assert.equal(await DMBAdminAlert.countDocuments({ type: 'assignment_expired' }), 1);
    assert.equal((await svc.sweepAssignments(later)).expired, 0);
    assert.equal(await DMBAdminAlert.countDocuments({ type: 'assignment_expired' }), 1);
});

test('sweep: a cell with orders and no accepted driver alerts admin only inside the configured window before the slot', async () => {
    await order();
    await setControl('driverAssignment', { noCoverageAlertHours: 2 });
    const slotStart = tm.zonedInstant(ymd(tomorrow), '12:00');
    await svc.sweepAssignments(new Date(slotStart.getTime() - 5 * 3_600_000));
    assert.equal(await DMBAdminAlert.countDocuments({ type: 'zone_slot_uncovered' }), 0, 'too early');
    const res = await svc.sweepAssignments(new Date(slotStart.getTime() - 90 * 60_000));
    assert.equal(res.uncoveredAlerts, 1);
    const alert = await DMBAdminAlert.findOne({ type: 'zone_slot_uncovered' }).lean();
    assert.equal(alert.severity, 'critical');
    assert.equal(alert.data.slotKey, 'lunch');
    assert.equal((await svc.sweepAssignments(new Date(slotStart.getTime() - 60 * 60_000))).uncoveredAlerts, 0, 'not repeated');
});

test('sweep: a covered cell raises no uncovered alert', async () => {
    await order();
    const d = await driver();
    const { shift } = await assign(d);
    await svc.respondToAssignment(d._id, shift._id, { accept: true });
    await svc.sweepAssignments(new Date(tm.zonedInstant(ymd(tomorrow), '12:00').getTime() - 60 * 60_000));
    assert.equal(await DMBAdminAlert.countDocuments({ type: 'zone_slot_uncovered' }), 0);
});

test('sweep: the daily planning reminder lists tomorrow\'s uncovered cells after the configured time, once a day', async () => {
    await order();
    await setControl('driverAssignment', { planningReminderTime: '18:00' });
    await svc.sweepAssignments(tm.zonedInstant(ymd(today), '17:00'));
    assert.equal(await DMBAdminAlert.countDocuments({ type: 'planning_incomplete' }), 0, 'before the reminder time');
    const r = await svc.sweepAssignments(tm.zonedInstant(ymd(today), '18:30'));
    assert.equal(r.reminders, 1);
    assert.equal((await svc.sweepAssignments(tm.zonedInstant(ymd(today), '19:30'))).reminders, 0, 'once per day');
    const alert = await DMBAdminAlert.findOne({ type: 'planning_incomplete' }).lean();
    assert.equal(alert.data.date, ymd(tomorrow));
    assert.equal(alert.data.cells, 1);
});

test('unassign removes the driver and tells them; a driver who already started cannot be removed', async () => {
    const d = await driver();
    const { shift } = await assign(d);
    assert.deepEqual(await svc.unassignDriver({ shiftId: shift._id }), { removed: true });
    assert.equal(await ShiftRecord.countDocuments({}), 0);
    const { shift: s2 } = await assign(d);
    await ShiftRecord.updateOne({ _id: s2._id }, { $set: { checkedInAt: new Date() } });
    await assert.rejects(svc.unassignDriver({ shiftId: s2._id }), /already started/);
});

test('copy: repeats one day\'s live assignments on another day and reports what it could not copy', async () => {
    const d = await driver();
    const e = await driver([w.zone._id]);
    await assign(d); await assign(e);
    await w.FoodDeliveryPartner.updateOne({ _id: e._id }, { $set: { zoneIds: [w.zone2._id] } }); // no longer authorised for the zone
    const next = tm.addDays(tomorrow, 1);
    const res = await svc.copyAssignments({ fromDate: ymd(tomorrow), toDate: ymd(next), adminId: w.admin._id });
    assert.equal(res.copied, 1);
    assert.equal(res.skipped.length, 1);
    assert.match(res.skipped[0].reason, /not authorised/);
    assert.equal(await ShiftRecord.countDocuments({ date: next }), 1);
});

test('eligible drivers are those authorised for the zone; already-booked ones are flagged', async () => {
    const inZone = await driver(); const additional = await driver([w.zone2._id, w.zone._id]); await driver([w.zone2._id]);
    await w.FoodDeliveryPartner.create({ name: 'Pending', phone: nextPhone(), status: 'pending', zoneIds: [w.zone._id] });
    await assign(inZone);
    const list = await svc.eligibleDrivers({ zoneId: w.zone._id, date: ymd(tomorrow), slotKey: 'lunch' });
    assert.equal(list.length, 2);
    assert.equal(list.find((x) => String(x._id) === String(inZone._id)).alreadyInCell, true);
    assert.equal(list.find((x) => String(x._id) === String(additional._id)).additionalZone, true, 'a driver whose primary zone is another one is an additional-zone driver here');
});

// ─── Dispatch uses only accepted drivers ────────────────────────────────────────────────────────────────────────
const ready = () => order({ status: 'ready' });
const trigger = async () => (await import('../src/modules/dailymealbox/subscription/dmb.dailyOrder.service.js')).triggerDriverNotificationIfAllReady(w.vendor._id, tomorrow, 'lunch');

test('dispatch: nobody assigned → the pickup is not offered to anyone and admin is alerted', async () => {
    await driver(); // an online approved driver in the zone, but never assigned
    await w.FoodDeliveryPartner.updateMany({}, { $set: { availabilityStatus: 'online' } });
    await ready();
    await trigger();
    const batch = await CollectionBatch.findOne({});
    assert.equal(batch.status, 'pending');
    const alert = await DMBAdminAlert.findOne({ type: 'pickup_no_driver' }).lean();
    assert.match(alert.message, /no driver accepted an assignment/);
});

test('dispatch: a driver who was assigned but has not accepted is not offered the pickup', async () => {
    const d = await driver();
    await assign(d);
    await ready();
    await trigger();
    assert.equal(await DMBAdminAlert.countDocuments({ type: 'pickup_no_driver' }), 1);
});

test('dispatch: the accepted driver is given the pickup (PIN issued) and nobody else gets anything; no alert', async () => {
    const accepted = await driver(); const bystander = await driver();
    await w.FoodDeliveryPartner.updateMany({}, { $set: { availabilityStatus: 'online' } });
    const { shift } = await assign(accepted);
    await svc.respondToAssignment(accepted._id, shift._id, { accept: true });
    const o = await ready();
    await trigger();
    assert.equal(await DMBAdminAlert.countDocuments({ type: 'pickup_no_driver' }), 0);
    const batches = await CollectionBatch.find({});
    assert.equal(batches.length, 1);
    assert.equal(String(batches[0].driverId), String(accepted._id));
    assert.equal(batches[0].status, 'driver_assigned');
    assert.match(readCollectionPin(batches[0]), /^\d{4}$/);
    assert.equal(await CollectionBatch.countDocuments({ driverId: bystander._id }), 0);
    assert.equal(String((await w.DMBDailyOrder.findById(o._id).lean()).dispatch.deliveryPartnerId), String(accepted._id));
});
