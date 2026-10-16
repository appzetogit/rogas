/**
 * Stage B of dispatch: splitting a zone x slot between its accepted drivers, locking at the slot cutoff, releasing waiting
 * pickups when a driver accepts, and admin moves.
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/cellPlanner.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connect, disconnect, seedWorld, nextPhone, clearControls, WARSAW, acceptAssignment } from './helpers/amendmentFixtures.mjs';

let w, planner, assignment, ShiftRecord, CollectionBatch, DMBAdminAlert, DMBCellPlan, tm, tomorrow;

before(async () => {
    await connect('cell_planner_test');
    w = await seedWorld();
    planner = await import('../src/modules/dailymealbox/delivery/cellPlanner.service.js');
    assignment = await import('../src/modules/dailymealbox/delivery/driverAssignment.service.js');
    tm = await import('../src/utils/platformTime.js');
    ({ ShiftRecord } = await import('../src/modules/food/delivery/models/shiftRecord.model.js'));
    ({ CollectionBatch } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js'));
    ({ DMBAdminAlert } = await import('../src/modules/dailymealbox/platform/platform.models.js'));
    ({ DMBCellPlan } = await import('../src/modules/dailymealbox/delivery/cellPlan.model.js'));
    tomorrow = tm.addDays(tm.localToday(), 1);
    await w.DeliverySlot.create({ key: 'lunch', name: 'Lunch', startTime: '12:00', endTime: '15:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true, orderCutoffHours: 2 });
});
after(disconnect);

beforeEach(async () => {
    const { PantryOrder } = await import('../src/modules/food/restaurant/models/pantryOrder.model.js');
    await Promise.all([PantryOrder.deleteMany({}), ShiftRecord.deleteMany({}), CollectionBatch.deleteMany({}), DMBAdminAlert.deleteMany({}), DMBCellPlan.deleteMany({}), w.DMBDailyOrder.deleteMany({}), w.FoodDeliveryPartner.deleteMany({})]);
    await clearControls();
});

const ymd = (d) => tm.storageDateStr(d);
const driver = (name) => w.FoodDeliveryPartner.create({ name, phone: nextPhone(), status: 'approved', zoneIds: [w.zone._id], primaryZoneId: w.zone._id });
const accept = (d) => acceptAssignment(d, { zoneId: w.zone._id, slotKeys: ['lunch'], days: [1] });
const customer = (suffix) => w.FoodUser.create({ phone: nextPhone(), name: `Customer ${suffix}`, role: 'USER' });
const at = (lat, lng) => ({ street: `Street ${lat.toFixed(3)}`, city: 'Warsaw', state: 'Mazowieckie', label: 'Home', location: { type: 'Point', coordinates: [lng, lat] } });
const order = (user, lat, lng, over = {}) => w.DMBDailyOrder.create({
    orderType: 'subscription', subscriptionId: new mongoose.Types.ObjectId(), userId: user._id, vendorId: w.vendor._id, zoneId: w.zone._id,
    meals: [{ name: 'Rosół', quantity: 1 }], deliveryDate: tomorrow, deliverySlot: 'lunch', status: 'scheduled', deliveryAddress: at(lat, lng), ...over
});
const cell = { get zoneId() { return w.zone._id; }, get date() { return ymd(tomorrow); }, slotKey: 'lunch' };
const driverOf = async (o) => String((await w.DMBDailyOrder.findById(o._id).lean()).dispatch.deliveryPartnerId);

test('splitStops: an even split gives each driver a contiguous geographic stretch', () => {
    const stops = [];
    for (let i = 0; i < 4; i += 1) stops.push({ key: `w${i}`, weight: 1, lat: WARSAW.lat + i * 0.001, lng: WARSAW.lng - 0.1 });
    for (let i = 0; i < 4; i += 1) stops.push({ key: `e${i}`, weight: 1, lat: WARSAW.lat + i * 0.001, lng: WARSAW.lng + 0.1 });
    const out = planner.splitStops(stops, ['a', 'b']);
    const keysOf = (d) => out.get(d).map((s) => s.key[0]);
    assert.equal(out.get('a').length, 4);
    assert.equal(out.get('b').length, 4);
    assert.equal(new Set(keysOf('a')).size, 1, 'one driver gets one side of the zone');
    assert.equal(new Set(keysOf('b')).size, 1);
});

test('splitStops: weights are balanced and existing loads are respected', () => {
    const stops = [1, 1, 1, 1, 1, 1].map((weight, i) => ({ key: `s${i}`, weight, lat: WARSAW.lat + i * 0.001, lng: WARSAW.lng }));
    const out = planner.splitStops(stops, ['a', 'b'], { a: 4 });
    const w2 = (d) => out.get(d).reduce((s, x) => s + x.weight, 0);
    assert.ok(Math.abs(w2('a') + 4 - w2('b')) <= 2, `a carries ${w2('a') + 4}, b carries ${w2('b')}`);
    assert.ok(w2('b') > w2('a'), 'the driver who already carries more gets less');
});

test('a single accepted driver takes everything; no accepted driver places nothing', async () => {
    const u = await customer('A');
    await order(u, WARSAW.lat, WARSAW.lng); await order(u, WARSAW.lat + 0.01, WARSAW.lng);
    assert.deepEqual(await planner.splitCell(cell), { drivers: [], placed: 0, unplaced: 2 });
    const d = await driver('Solo'); await accept(d);
    const res = await planner.splitCell(cell);
    assert.equal(res.placed, 2);
    const all = await w.DMBDailyOrder.find({}).lean();
    assert.ok(all.every((o) => String(o.dispatch.deliveryPartnerId) === String(d._id)));
});

test('two drivers: balanced by tiffins, the same customer at the same address is one stop with one driver, and a rerun changes nothing', async () => {
    const d1 = await driver('One'); const d2 = await driver('Two'); await accept(d1); await accept(d2);
    const same = await customer('Same');
    const bundled = [await order(same, WARSAW.lat, WARSAW.lng - 0.1), await order(same, WARSAW.lat, WARSAW.lng - 0.1, { deliverySlot: 'lunch' })];
    const west = [];
    for (let i = 1; i <= 3; i += 1) west.push(await order(await customer(`W${i}`), WARSAW.lat + i * 0.001, WARSAW.lng - 0.1));
    const east = [];
    for (let i = 1; i <= 5; i += 1) east.push(await order(await customer(`E${i}`), WARSAW.lat + i * 0.001, WARSAW.lng + 0.1));

    await planner.splitCell(cell);
    assert.equal(await driverOf(bundled[0]), await driverOf(bundled[1]), 'one doorbell: same driver');
    const counts = {};
    for (const o of await w.DMBDailyOrder.find({}).lean()) counts[o.dispatch.deliveryPartnerId] = (counts[o.dispatch.deliveryPartnerId] || 0) + 1;
    assert.equal(counts[d1._id] + counts[d2._id], 10);
    assert.ok(Math.abs(counts[d1._id] - counts[d2._id]) <= 2, JSON.stringify(counts));
    assert.equal(new Set(await Promise.all(east.map(driverOf))).size, 1, 'a whole side of the zone goes to one driver');

    const before = JSON.stringify((await w.DMBDailyOrder.find({}).sort({ _id: 1 }).lean()).map((o) => o.dispatch.deliveryPartnerId));
    const again = await planner.splitCell(cell);
    assert.equal(again.placed, 0);
    assert.equal(JSON.stringify((await w.DMBDailyOrder.find({}).sort({ _id: 1 }).lean()).map((o) => o.dispatch.deliveryPartnerId)), before);
});

test('a late order joins the least loaded driver; orders of a driver who is no longer accepted are re-placed', async () => {
    const d1 = await driver('One'); const d2 = await driver('Two'); await accept(d1); await accept(d2);
    for (let i = 1; i <= 4; i += 1) await order(await customer(`A${i}`), WARSAW.lat + i * 0.001, WARSAW.lng - 0.1);
    await planner.splitCell(cell);
    const heavy = String(d1._id);
    // d2 gets removed from the cell
    await ShiftRecord.deleteOne({ driverId: d2._id });
    const late = await order(await customer('Late'), WARSAW.lat, WARSAW.lng);
    await planner.splitCell(cell);
    assert.ok((await w.DMBDailyOrder.find({}).lean()).every((o) => String(o.dispatch.deliveryPartnerId) === heavy), 'everything is on the only accepted driver');
    assert.equal(await driverOf(late), heavy);
});

test('lock: only after the slot cutoff (start minus the slot\'s cutoff hours), once, and it records the split', async () => {
    const d1 = await driver('One'); const d2 = await driver('Two'); await accept(d1); await accept(d2);
    for (let i = 1; i <= 4; i += 1) await order(await customer(`L${i}`), WARSAW.lat + i * 0.001, WARSAW.lng - 0.1 + (i % 2) * 0.2);
    const start = tm.zonedInstant(ymd(tomorrow), '12:00');
    assert.equal((await planner.lockDueCells(new Date(start.getTime() - 3 * 3_600_000))).locked, 0, 'before the cutoff (10:00)');
    assert.equal(await DMBCellPlan.countDocuments({}), 0);
    assert.equal((await planner.lockDueCells(new Date(start.getTime() - 119 * 60_000))).locked, 1, 'after the cutoff');
    const plan = await DMBCellPlan.findOne({}).lean();
    assert.ok(plan.lockedAt);
    assert.equal(plan.split.length, 2);
    assert.equal((await planner.lockDueCells(new Date(start.getTime() - 60 * 60_000))).locked, 0, 'locked once');
    const loads = (await assignment.planningBoard(ymd(tomorrow))).cells.find((c) => String(c.zoneId) === String(w.zone._id) && c.slotKey === 'lunch');
    assert.ok(loads.lockedAt);
    assert.equal(loads.assignments.reduce((n, a) => n + a.load, 0), 4);
});

test('ready orders with nobody accepted wait and alert; the moment a driver accepts, their pickup is created and the waiting batch is gone', async () => {
    const d = await driver('Late acceptor');
    const o = await order(await customer('R'), WARSAW.lat, WARSAW.lng, { status: 'ready' });
    const { triggerDriverNotificationIfAllReady } = await import('../src/modules/dailymealbox/subscription/dmb.dailyOrder.service.js');
    const first = await triggerDriverNotificationIfAllReady(w.vendor._id, tomorrow, 'lunch');
    assert.equal(first.unassigned, 1);
    assert.equal((await CollectionBatch.find({})).length, 1);
    assert.equal((await CollectionBatch.findOne({})).driverId, null);
    assert.equal(await DMBAdminAlert.countDocuments({ type: 'pickup_no_driver' }), 1);

    // Admin assigns and the driver accepts.
    const { shift } = await assignment.assignDriver({ date: ymd(tomorrow), zoneId: w.zone._id, slotKey: 'lunch', driverId: d._id, adminId: w.admin._id });
    await assignment.respondToAssignment(d._id, shift._id, { accept: true });

    const batches = await CollectionBatch.find({});
    assert.equal(batches.length, 1, 'the waiting batch was replaced');
    assert.equal(String(batches[0].driverId), String(d._id));
    assert.equal(batches[0].status, 'driver_assigned');
    assert.equal(await driverOf(o), String(d._id));
});

test('admin move: a ready delivery goes from one driver\'s pickup to another accepted driver\'s; others are refused', async () => {
    const d1 = await driver('One'); const d2 = await driver('Two'); const out = await driver('Outsider'); await accept(d1); await accept(d2);
    const a = await order(await customer('M1'), WARSAW.lat, WARSAW.lng - 0.1, { status: 'ready' });
    const b = await order(await customer('M2'), WARSAW.lat, WARSAW.lng + 0.1, { status: 'ready' });
    const { triggerDriverNotificationIfAllReady } = await import('../src/modules/dailymealbox/subscription/dmb.dailyOrder.service.js');
    await triggerDriverNotificationIfAllReady(w.vendor._id, tomorrow, 'lunch');
    assert.equal((await CollectionBatch.find({})).length, 2, 'one pickup per driver');
    const from = await driverOf(a);
    const to = from === String(d1._id) ? d2 : d1;

    await assert.rejects(planner.moveUnit({ kind: 'meal', id: a._id, toDriverId: out._id }), /has not accepted/);
    await planner.moveUnit({ kind: 'meal', id: a._id, toDriverId: to._id });
    assert.equal(await driverOf(a), String(to._id));
    const toBatch = await CollectionBatch.findOne({ driverId: to._id });
    assert.ok(toBatch.orderIds.map(String).includes(String(a._id)));
    assert.equal(toBatch.boxCount, 2);
    assert.equal(await CollectionBatch.countDocuments({ driverId: from }), 0, 'the previous driver emptied pickup is removed');

    await w.DMBDailyOrder.updateOne({ _id: b._id }, { $set: { status: 'out_for_delivery' } });
    await assert.rejects(planner.moveUnit({ kind: 'meal', id: b._id, toDriverId: d1._id }), /already with a driver/);
});

test('cell detail lists every delivery with its driver and the drivers it can move to', async () => {
    const d1 = await driver('One'); await accept(d1);
    await order(await customer('D1'), WARSAW.lat, WARSAW.lng); await order(await customer('D2'), WARSAW.lat + 0.01, WARSAW.lng, { meals: [{ name: 'x', quantity: 3 }] });
    await planner.splitCell(cell);
    const detail = await planner.cellDetail(cell);
    assert.equal(detail.units.length, 2);
    assert.equal(detail.drivers.length, 1);
    assert.equal(detail.drivers[0].load, 4);
    assert.equal(detail.drivers[0].stops, 2);
    assert.ok(detail.units.every((u) => u.movable && u.driverId === String(d1._id)));
});

test('accepting before the lock places nothing, so a driver who accepts later still gets a fair share at the lock', async () => {
    const d1 = await driver('First'); const d2 = await driver('Second');
    for (let i = 1; i <= 6; i += 1) await order(await customer(`P${i}`), WARSAW.lat + i * 0.001, WARSAW.lng + (i % 2 ? -0.1 : 0.1));
    for (const d of [d1, d2]) {
        const { shift } = await assignment.assignDriver({ date: ymd(tomorrow), zoneId: w.zone._id, slotKey: 'lunch', driverId: d._id, adminId: w.admin._id });
        await assignment.respondToAssignment(d._id, shift._id, { accept: true });
        assert.equal(await w.DMBDailyOrder.countDocuments({ 'dispatch.deliveryPartnerId': { $ne: null } }), 0, 'nothing is placed by an acceptance alone');
    }
    const start = tm.zonedInstant(ymd(tomorrow), '12:00');
    await planner.lockDueCells(new Date(start.getTime() - 100 * 60_000));
    const counts = {};
    for (const o of await w.DMBDailyOrder.find({}).lean()) counts[o.dispatch.deliveryPartnerId] = (counts[o.dispatch.deliveryPartnerId] || 0) + 1;
    assert.equal(counts[d1._id], 3);
    assert.equal(counts[d2._id], 3);
});
