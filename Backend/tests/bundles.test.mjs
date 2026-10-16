/**
 * One doorbell, one PIN: items for the same customer at the same address, day and slot form a bundle with a shared delivery PIN;
 * one correct PIN delivers every collected item of it; the driver is paid once per drop; a bundle moves between drivers whole.
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/bundles.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connect, disconnect, seedWorld, nextPhone, clearControls, WARSAW, acceptAssignment } from './helpers/amendmentFixtures.mjs';

let w, planner, earnings, models, pin, tm, tomorrow, PantryOrder;

before(async () => {
    await connect('bundles_test');
    w = await seedWorld();
    planner = await import('../src/modules/dailymealbox/delivery/cellPlanner.service.js');
    earnings = await import('../src/modules/dailymealbox/delivery/driverEarnings.service.js');
    models = await import('../src/modules/dailymealbox/delivery/driverEarnings.models.js');
    pin = await import('../src/modules/dailymealbox/delivery/collectionPin.service.js');
    tm = await import('../src/utils/platformTime.js');
    ({ PantryOrder } = await import('../src/modules/food/restaurant/models/pantryOrder.model.js'));
    tomorrow = tm.addDays(tm.localToday(), 1);
    await w.DeliverySlot.create({ key: 'lunch', name: 'Lunch', startTime: '12:00', endTime: '15:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true });
});
after(disconnect);

beforeEach(async () => {
    const { ShiftRecord } = await import('../src/modules/food/delivery/models/shiftRecord.model.js');
    const { CollectionBatch } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js');
    await Promise.all([
        PantryOrder.deleteMany({}), ShiftRecord.deleteMany({}), CollectionBatch.deleteMany({}), w.DMBDailyOrder.deleteMany({}), w.FoodDeliveryPartner.deleteMany({}),
        models.DMBDeliveryRate.deleteMany({}), models.DMBPromotionAward.deleteMany({}), models.DMBDriverPromotion.deleteMany({}), models.DMBBundlePay.deleteMany({})
    ]);
    await clearControls();
    await earnings.saveRate({ ratePln: 8, effectiveFrom: '2000-01-01' });
});

const ymd = (d) => tm.storageDateStr(d);
const driver = (name) => w.FoodDeliveryPartner.create({ name, phone: nextPhone(), status: 'approved', zoneIds: [w.zone._id], primaryZoneId: w.zone._id });
const customer = (suffix) => w.FoodUser.create({ phone: nextPhone(), name: `Customer ${suffix}`, role: 'USER' });
const at = (lat, lng) => ({ street: `Street ${lat.toFixed(3)}`, city: 'Warsaw', state: 'Mazowieckie', label: 'Home', location: { type: 'Point', coordinates: [lng, lat] } });
let pinSeq = 1000;
const meal = (user, lat, lng, over = {}) => w.DMBDailyOrder.create({
    orderType: 'subscription', subscriptionId: new mongoose.Types.ObjectId(), userId: user._id, vendorId: w.vendor._id, zoneId: w.zone._id,
    meals: [{ name: 'Rosol', quantity: 1 }], deliveryDate: tomorrow, deliverySlot: 'lunch', status: 'scheduled', deliveryAddress: at(lat, lng), deliveryPin: String(pinSeq++), ...over
});
const bag = async (user, lat, lng, over = {}) => {
    const _id = new mongoose.Types.ObjectId();
    await PantryOrder.collection.insertOne({
        orderId: `PO-${_id.toString().slice(-6)}`, userId: user._id, vendorId: w.vendor._id, status: 'paid', items: [], deliveryAddress: at(lat, lng),
        dailyDeliveries: [{ _id, date: tomorrow, slot: 'lunch', status: 'scheduled', deliveryPin: String(pinSeq++), ...over }]
    });
    return _id;
};
const cell = { get zoneId() { return w.zone._id; }, get date() { return ymd(tomorrow); }, slotKey: 'lunch' };
const bagOf = async (id) => (await PantryOrder.findOne({ 'dailyDeliveries._id': id }).lean()).dailyDeliveries.find((d) => String(d._id) === String(id));

test('same customer, same address, same slot: one bundle with one PIN (two meals, or a meal and a bag); others stay single', async () => {
    const anna = await customer('Anna'); const ola = await customer('Ola');
    const a1 = await meal(anna, WARSAW.lat, WARSAW.lng); const a2 = await meal(anna, WARSAW.lat, WARSAW.lng);
    const bagId = await bag(anna, WARSAW.lat, WARSAW.lng);
    const other = await meal(anna, WARSAW.lat + 0.05, WARSAW.lng, {}); // same customer, another address
    const single = await meal(ola, WARSAW.lat, WARSAW.lng + 0.05);
    await planner.splitCell(cell);
    const [f1, f2, fo, fs] = await Promise.all([a1, a2, other, single].map((o) => w.DMBDailyOrder.findById(o._id).lean()));
    const fb = await bagOf(bagId);
    assert.match(f1.bundleId, /^BND-\d{4}-\d{2}-\d{2}-lunch-[0-9a-f]{8}$/);
    assert.equal(f1.bundleId, f2.bundleId);
    assert.equal(f1.bundleId, fb.bundleId, 'the pantry bag rides in the same bundle');
    assert.equal(f1.deliveryPin, f2.deliveryPin);
    assert.equal(f1.deliveryPin, fb.deliveryPin, 'one PIN for the whole bundle');
    assert.equal(fo.bundleId, '', 'another address is another stop');
    assert.equal(fs.bundleId, '', 'a lone item is not a bundle');
    assert.notEqual(fo.deliveryPin, f1.deliveryPin);
    // stable: a rerun neither changes the bundle nor its PIN
    await planner.splitCell(cell);
    const again = await w.DMBDailyOrder.findById(a1._id).lean();
    assert.equal(again.bundleId, f1.bundleId);
    assert.equal(again.deliveryPin, f1.deliveryPin);
});

test('a PIN the group already shares is kept when another item joins it', async () => {
    const anna = await customer('Anna');
    const a1 = await meal(anna, WARSAW.lat, WARSAW.lng);
    await planner.splitCell(cell);
    const first = await w.DMBDailyOrder.findById(a1._id).lean();
    assert.equal(first.bundleId, '');
    const a2 = await meal(anna, WARSAW.lat, WARSAW.lng);
    await planner.splitCell(cell);
    const pins = (await w.DMBDailyOrder.find({ _id: { $in: [a1._id, a2._id] } }).lean()).map((o) => o.deliveryPin);
    assert.equal(new Set(pins).size, 1);
    await planner.splitCell(cell);
    const a3 = await meal(anna, WARSAW.lat, WARSAW.lng);
    await planner.splitCell(cell);
    const all = (await w.DMBDailyOrder.find({ _id: { $in: [a1._id, a2._id, a3._id] } }).lean()).map((o) => o.deliveryPin);
    assert.equal(new Set(all).size, 1);
    assert.equal(all[0], pins[0], 'the customer is not given a new number when something joins');
});

test('one correct PIN delivers every collected item of the bundle; an item still at the vendor stays open', async () => {
    const d = await driver('Carrier'); await acceptAssignment(d, { zoneId: w.zone._id, slotKeys: ['lunch'], days: [1] });
    const anna = await customer('Anna');
    const a1 = await meal(anna, WARSAW.lat, WARSAW.lng, { status: 'ready' });
    const a2 = await meal(anna, WARSAW.lat, WARSAW.lng, { status: 'ready' });
    const bagId = await bag(anna, WARSAW.lat, WARSAW.lng, { status: 'ready' });
    const waiting = await meal(anna, WARSAW.lat, WARSAW.lng, { status: 'ready' });
    await planner.splitCell(cell); // the bundle is formed while everything is still at the vendor
    await w.DMBDailyOrder.updateMany({}, { $set: { 'dispatch.deliveryPartnerId': d._id } });
    await PantryOrder.updateMany({}, { $set: { 'dailyDeliveries.$[].driverId': d._id } });
    // the driver collects all but one of them
    await w.DMBDailyOrder.updateMany({ _id: { $in: [a1._id, a2._id] } }, { $set: { status: 'out_for_delivery' } });
    await PantryOrder.updateMany({}, { $set: { 'dailyDeliveries.$[].status': 'out_for_delivery' } });
    const shared = (await w.DMBDailyOrder.findById(a1._id).lean()).deliveryPin;

    await assert.rejects(pin.verifyDeliveryPin({ orderId: a1._id, pinEntered: '0000', driverId: d._id }), /Incorrect delivery PIN/);
    const res = await pin.verifyDeliveryPin({ orderId: a1._id, pinEntered: shared, driverId: d._id });
    assert.equal(res.bundled.length, 2, 'the other meal and the bag came with it');
    assert.equal((await w.DMBDailyOrder.findById(a1._id).lean()).status, 'delivered');
    assert.equal((await w.DMBDailyOrder.findById(a2._id).lean()).status, 'delivered');
    assert.equal((await bagOf(bagId)).status, 'delivered');
    assert.equal((await w.DMBDailyOrder.findById(waiting._id).lean()).status, 'ready', 'not collected yet, so not handed over');
});

test('a bag verified first still delivers its bundle mates', async () => {
    const d = await driver('Carrier');
    const anna = await customer('Anna');
    const bagId = await bag(anna, WARSAW.lat, WARSAW.lng, { status: 'ready' });
    const m = await meal(anna, WARSAW.lat, WARSAW.lng, { status: 'ready' });
    await planner.splitCell(cell);
    await w.DMBDailyOrder.updateMany({}, { $set: { 'dispatch.deliveryPartnerId': d._id, status: 'out_for_delivery' } });
    await PantryOrder.updateMany({}, { $set: { 'dailyDeliveries.$[].driverId': d._id, 'dailyDeliveries.$[].status': 'out_for_delivery' } });
    const shared = (await bagOf(bagId)).deliveryPin;
    const res = await pin.verifyDeliveryPin({ orderId: bagId, pinEntered: shared, driverId: d._id });
    assert.equal(res.bundled.length, 1);
    assert.equal((await w.DMBDailyOrder.findById(m._id).lean()).status, 'delivered');
});

test('the driver is paid once per drop: the bundle pays one rate, the second item nothing, and promotions count drops', async () => {
    await earnings.savePromotion({ name: 'Two drops', type: 'delivery_count', targetCount: 2, bonusPln: 20, validFrom: ymd(tm.addDays(tm.localToday(), -3)), validUntil: ymd(tm.addDays(tm.localToday(), 3)), status: 'active' });
    const d = await driver('Carrier');
    const anna = await customer('Anna'); const ola = await customer('Ola');
    const date = tm.localToday();
    const mk = (u, lat, lng) => meal(u, lat, lng, { deliveryDate: date, status: 'delivered' });
    const a1 = await mk(anna, WARSAW.lat, WARSAW.lng); const a2 = await mk(anna, WARSAW.lat, WARSAW.lng);
    const o1 = await mk(ola, WARSAW.lat, WARSAW.lng + 0.05);
    await w.DMBDailyOrder.updateMany({}, { $set: { 'dispatch.deliveryPartnerId': d._id } });
    await w.DMBDailyOrder.updateMany({ _id: { $in: [a1._id, a2._id] } }, { $set: { bundleId: 'BND-test-1' } });

    const first = await earnings.settleMealDelivery({ orderId: a1._id, driverId: d._id });
    assert.equal(first.riderEarning, 8);
    const mate = await earnings.settleMealDelivery({ orderId: a2._id, driverId: d._id });
    assert.equal(mate.riderEarning, 0, 'the same doorbell pays once');
    assert.equal(mate.bundled, true);
    assert.deepEqual(mate.bonuses, []);
    assert.equal((await w.FoodDeliveryPartner.findById(d._id).lean()).deliveriesToday, 1);
    const second = await earnings.settleMealDelivery({ orderId: o1._id, driverId: d._id });
    assert.equal(second.bonuses.length, 1, 'two drops (not three items) reach the target of two');
    assert.equal(second.riderEarning, 8 + 20);
    const rows = await w.DMBDailyOrder.find({}).lean();
    assert.equal(rows.reduce((n, o) => n + o.riderEarning, 0), 8 + 8 + 20);
});

test('moving one item moves its whole bundle to the other driver', async () => {
    const d1 = await driver('One'); const d2 = await driver('Two');
    await acceptAssignment(d1, { zoneId: w.zone._id, slotKeys: ['lunch'], days: [1] });
    await acceptAssignment(d2, { zoneId: w.zone._id, slotKeys: ['lunch'], days: [1] });
    const anna = await customer('Anna');
    const a1 = await meal(anna, WARSAW.lat, WARSAW.lng); const a2 = await meal(anna, WARSAW.lat, WARSAW.lng);
    for (let i = 0; i < 4; i += 1) await meal(await customer(`F${i}`), WARSAW.lat + i * 0.01, WARSAW.lng + 0.1);
    await planner.splitCell(cell);
    const owner = String((await w.DMBDailyOrder.findById(a1._id).lean()).dispatch.deliveryPartnerId);
    assert.equal(String((await w.DMBDailyOrder.findById(a2._id).lean()).dispatch.deliveryPartnerId), owner);
    const to = owner === String(d1._id) ? d2 : d1;
    const res = await planner.moveUnit({ kind: 'meal', id: a1._id, toDriverId: to._id });
    assert.equal(res.count, 2);
    for (const o of [a1, a2]) assert.equal(String((await w.DMBDailyOrder.findById(o._id).lean()).dispatch.deliveryPartnerId), String(to._id));
});
