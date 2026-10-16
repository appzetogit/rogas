/**
 * Driver earnings: the rate table (zone x slot > zone > slot > base), rate boosts, count / coverage bonuses paid exactly once,
 * and the settle functions behind "confirm payment".
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/driverEarnings.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connect, disconnect, seedWorld, setControl, clearControls, nextPhone } from './helpers/amendmentFixtures.mjs';

let w, svc, models, tm, DMBAdminAlert, FeeSettings, PantryOrder;

before(async () => {
    await connect('driver_earnings_test');
    w = await seedWorld();
    svc = await import('../src/modules/dailymealbox/delivery/driverEarnings.service.js');
    models = await import('../src/modules/dailymealbox/delivery/driverEarnings.models.js');
    tm = await import('../src/utils/platformTime.js');
    ({ DMBAdminAlert } = await import('../src/modules/dailymealbox/platform/platform.models.js'));
    ({ DeliveryOrderFeeSettings: FeeSettings } = await import('../src/modules/food/admin/models/deliveryOrderFeeSettings.model.js'));
    ({ PantryOrder } = await import('../src/modules/food/restaurant/models/pantryOrder.model.js'));
    await w.DeliverySlot.create({ key: 'lunch', name: 'Lunch', startTime: '12:00', endTime: '15:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true });
    await w.DeliverySlot.create({ key: 'dinner', name: 'Dinner', startTime: '17:00', endTime: '20:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true });
});
after(disconnect);

beforeEach(async () => {
    await Promise.all([
        models.DMBDeliveryRate.deleteMany({}), models.DMBDriverPromotion.deleteMany({}), models.DMBPromotionAward.deleteMany({}),
        w.DMBDailyOrder.deleteMany({}), w.FoodDeliveryPartner.deleteMany({}), DMBAdminAlert.deleteMany({}), FeeSettings.deleteMany({}), PantryOrder.deleteMany({})
    ]);
    await clearControls();
});

const today = () => tm.localToday();
const ymd = (d) => tm.storageDateStr(d);
const rate = (over) => svc.saveRate({ ratePln: 8, effectiveFrom: '2000-01-01', ...over });
const driver = () => w.FoodDeliveryPartner.create({ name: 'Earner', phone: nextPhone(), status: 'approved', zoneIds: [w.zone._id], primaryZoneId: w.zone._id });
const delivered = (d, over = {}) => w.DMBDailyOrder.create({
    orderType: 'subscription', subscriptionId: new mongoose.Types.ObjectId(), userId: w.user._id, vendorId: w.vendor._id, zoneId: w.zone._id,
    meals: [{ name: 'Rosol', quantity: 1 }], deliveryDate: today(), deliverySlot: 'lunch', status: 'delivered', dispatch: { deliveryPartnerId: d._id }, ...over
});
const promo = (over) => svc.savePromotion({ name: 'P', type: 'delivery_count', targetCount: 2, bonusPln: 30, validFrom: ymd(tm.addDays(today(), -10)), validUntil: ymd(tm.addDays(today(), 10)), status: 'active', ...over });

test('the most specific rate wins: zone x slot > zone > slot > base', async () => {
    await rate({ ratePln: 8 });
    await rate({ slotKey: 'lunch', ratePln: 11 });
    await rate({ zoneId: w.zone._id, ratePln: 10 });
    await rate({ zoneId: w.zone._id, slotKey: 'lunch', ratePln: 14 });
    const at = (zoneId, slotKey) => svc.resolveRate({ zoneId, slotKey, date: today() });
    assert.deepEqual([(await at(w.zone._id, 'lunch')).rate, (await at(w.zone._id, 'lunch')).source], [14, 'zone_slot']);
    assert.deepEqual([(await at(w.zone._id, 'dinner')).rate, (await at(w.zone._id, 'dinner')).source], [10, 'zone']);
    assert.deepEqual([(await at(w.zone2._id, 'lunch')).rate, (await at(w.zone2._id, 'lunch')).source], [11, 'slot']);
    assert.deepEqual([(await at(w.zone2._id, 'dinner')).rate, (await at(w.zone2._id, 'dinner')).source], [8, 'base']);
});

test('a city rate beats a platform-wide one of the same shape; the newest effective date wins; future rates wait', async () => {
    await rate({ ratePln: 8 });
    await rate({ ratePln: 9, cityId: w.city._id });
    assert.equal((await svc.resolveRate({ zoneId: w.zone._id, slotKey: 'lunch', date: today() })).rate, 9);
    await rate({ ratePln: 12, cityId: w.city._id, effectiveFrom: ymd(tm.addDays(today(), -1)) });
    assert.equal((await svc.resolveRate({ zoneId: w.zone._id, slotKey: 'lunch', date: today() })).rate, 12, 'newer start date');
    assert.equal((await svc.resolveRate({ zoneId: w.zone._id, slotKey: 'lunch', date: tm.addDays(today(), -5) })).rate, 9, 'the rate in force that day');
    await rate({ ratePln: 99, cityId: w.city._id, effectiveFrom: ymd(tm.addDays(today(), 30)) });
    assert.equal((await svc.resolveRate({ zoneId: w.zone._id, slotKey: 'lunch', date: today() })).rate, 12, 'not yet in force');
    await models.DMBDeliveryRate.updateMany({}, { $set: { isActive: false } });
    assert.equal(await svc.resolveRate({ zoneId: w.zone._id, slotKey: 'lunch', date: today() }), null, 'inactive rows never apply');
});

test('with no rate row the Fee Settings value is used; with neither there is no rate at all', async () => {
    assert.equal(await svc.resolveRate({ zoneId: w.zone._id, slotKey: 'lunch', date: today() }), null);
    await FeeSettings.create({ feePerOrder: 6, isActive: true });
    const r = await svc.resolveRate({ zoneId: w.zone._id, slotKey: 'lunch', date: today() });
    assert.deepEqual([r.rate, r.source], [6, 'fee_settings']);
});

test('rate validation: amounts, unknown slot or zone, a zone outside the chosen city', async () => {
    await assert.rejects(rate({ ratePln: -1 }), /between 0 and 1000/);
    await assert.rejects(rate({ ratePln: 1001 }), /between 0 and 1000/);
    await assert.rejects(rate({ hubStopRate: 'x' }), /hub stop rate/);
    await assert.rejects(rate({ slotKey: 'brunch' }), /Slot not found/);
    await assert.rejects(rate({ zoneId: new mongoose.Types.ObjectId() }), /Zone not found/);
    const otherCity = await w.AdminCity.create({ name: `Other ${Date.now()}`, country: 'PL', currency: 'PLN', status: 'active', zoneIds: [] });
    await assert.rejects(rate({ zoneId: w.zone._id, cityId: otherCity._id }), /not in the chosen city/);
    const saved = await rate({ zoneId: w.zone._id });
    assert.equal(String(saved.cityId), String(w.city._id), 'the zone fills in its city');
});

test('hub stop rate: the most specific row that sets one', async () => {
    await rate({ ratePln: 8, hubStopRate: 3 });
    await rate({ zoneId: w.zone._id, ratePln: 10 }); // no hub rate of its own
    assert.equal((await svc.resolveHubStopRate({ zoneId: w.zone._id, slotKey: 'lunch', date: today() })).rate, 3);
    await rate({ zoneId: w.zone._id, slotKey: 'lunch', ratePln: 14, hubStopRate: 4 });
    assert.equal((await svc.resolveHubStopRate({ zoneId: w.zone._id, slotKey: 'lunch', date: today() })).rate, 4);
    await models.DMBDeliveryRate.updateMany({}, { $set: { hubStopRate: null } });
    assert.equal(await svc.resolveHubStopRate({ zoneId: w.zone._id, slotKey: 'lunch', date: today() }), null);
});

test('promotion validation and limits: fields per type, the ACM switch and the per-city maximum', async () => {
    await assert.rejects(promo({ type: 'nope' }), /Unknown promotion type/);
    await assert.rejects(promo({ name: ' ' }), /name/);
    await assert.rejects(promo({ validUntil: ymd(tm.addDays(today(), -20)) }), /cannot be before/);
    await assert.rejects(promo({ bonusPln: 0 }), /more than 0/);
    await assert.rejects(promo({ targetCount: 0 }), /at least 1/);
    await assert.rejects(promo({ type: 'zone_coverage' }), /needs a zone/);
    await assert.rejects(promo({ type: 'slot_coverage' }), /needs a slot/);
    await assert.rejects(promo({ type: 'rate_boost', rateBoostPln: 0 }), /more than 0/);

    await setControl('driverPromotions', { enabled: true, maxActive: 2 });
    await promo({ name: 'one' }); await promo({ name: 'two' });
    await assert.rejects(promo({ name: 'three' }), /limit is 2/);
    const draft = await promo({ name: 'three', status: 'draft' });
    await assert.rejects(svc.setPromotionStatus(draft._id, 'active'), /limit is 2/);
    await setControl('driverPromotions', { enabled: false, maxActive: 2 });
    await assert.rejects(promo({ name: 'four' }), /switched off/);
    const list = await svc.listPromotions();
    assert.equal(list.length, 3);
});

test('settling a meal delivery pays the rate plus a rate boost, once; the breakdown is stored', async () => {
    await rate({ ratePln: 8 });
    await promo({ type: 'rate_boost', rateBoostPln: 4, bonusPln: 0, targetCount: 0 });
    const d = await driver();
    const o = await delivered(d, { status: 'out_for_delivery' });
    const paid = await svc.settleMealDelivery({ orderId: o._id, driverId: d._id, method: 'CASH' });
    assert.equal(paid.riderEarning, 12);
    const fresh = await w.DMBDailyOrder.findById(o._id).lean();
    assert.equal(fresh.riderEarning, 12);
    assert.equal(fresh.paymentConfirmed, true);
    assert.equal(fresh.earningBreakdown.rate, 8);
    assert.equal(fresh.earningBreakdown.boosts[0].amount, 4);
    assert.equal((await w.FoodDeliveryPartner.findById(d._id).lean()).earningsToday, 12);
    await assert.rejects(svc.settleMealDelivery({ orderId: o._id, driverId: d._id }), (e) => e.code === 'ALREADY_CONFIRMED');
    assert.equal((await w.FoodDeliveryPartner.findById(d._id).lean()).earningsToday, 12, 'no double credit');
});

test('a boost only applies inside its window and scope', async () => {
    await rate({ ratePln: 8 });
    await promo({ type: 'rate_boost', rateBoostPln: 4, slotKey: 'dinner', bonusPln: 0, targetCount: 0 });
    await promo({ type: 'rate_boost', rateBoostPln: 5, name: 'old', validFrom: ymd(tm.addDays(today(), -30)), validUntil: ymd(tm.addDays(today(), -20)), bonusPln: 0, targetCount: 0 });
    assert.equal((await svc.previewDeliveryEarning({ zoneId: w.zone._id, slotKey: 'lunch', date: today() })).amount, 8);
    assert.equal((await svc.previewDeliveryEarning({ zoneId: w.zone._id, slotKey: 'dinner', date: today() })).amount, 12);
    assert.equal((await svc.previewDeliveryEarning({ zoneId: w.zone._id, slotKey: 'lunch', date: tm.addDays(today(), -25) })).amount, 13, 'the old boost on its own days');
});

test('no rate configured: nothing is paid, the order stays unconfirmed and admin is alerted', async () => {
    const d = await driver();
    const o = await delivered(d, { status: 'out_for_delivery' });
    await assert.rejects(svc.settleMealDelivery({ orderId: o._id, driverId: d._id }), (e) => e.code === 'RATE_NOT_SET');
    const fresh = await w.DMBDailyOrder.findById(o._id).lean();
    assert.equal(fresh.paymentConfirmed, false);
    assert.equal((await w.FoodDeliveryPartner.findById(d._id).lean()).earningsToday || 0, 0);
    assert.equal((await DMBAdminAlert.findOne({ type: 'driver_fee_missing' }))?.severity, 'critical');
});

test('delivery_count bonus: paid on the delivery that reaches the target, once per week, exactly once under concurrency', async () => {
    await rate({ ratePln: 8 });
    await promo({ targetCount: 3, bonusPln: 30 });
    const d = await driver();
    const orders = [await delivered(d), await delivered(d), await delivered(d)];
    // a fourth would be past the target
    const extra = await delivered(d);
    const results = await Promise.all(orders.map((o) => svc.settleMealDelivery({ orderId: o._id, driverId: d._id })));
    const bonuses = results.flatMap((r) => r.bonuses);
    assert.equal(bonuses.length, 1, 'only one of the concurrent settlements wins the bonus');
    assert.equal(bonuses[0].amount, 30);
    assert.equal(await models.DMBPromotionAward.countDocuments({}), 1);
    const total = (await w.DMBDailyOrder.find({ _id: { $in: orders.map((o) => o._id) } }).lean()).reduce((n, o) => n + o.riderEarning, 0);
    assert.equal(total, 3 * 8 + 30, 'the bonus is inside the deliveries riderEarning, so every earnings report includes it');
    assert.equal((await w.FoodDeliveryPartner.findById(d._id).lean()).earningsToday, 54);
    const late = await svc.settleMealDelivery({ orderId: extra._id, driverId: d._id });
    assert.deepEqual(late.bonuses, [], 'no second bonus in the same week');
});

test('the bonus counts only the promotion scope (slot) and the driver own deliveries', async () => {
    await rate({ ratePln: 8 });
    await promo({ targetCount: 2, bonusPln: 20, slotKey: 'lunch' });
    const d = await driver(); const other = await driver();
    const a = await delivered(d, { deliverySlot: 'dinner' });
    const b = await delivered(d, { deliverySlot: 'dinner' });
    const c = await delivered(other);
    const e = await delivered(d);
    for (const o of [a, b]) assert.deepEqual((await svc.settleMealDelivery({ orderId: o._id, driverId: d._id })).bonuses, []);
    assert.deepEqual((await svc.settleMealDelivery({ orderId: c._id, driverId: other._id })).bonuses, [], "someone else's lunch does not count");
    assert.deepEqual((await svc.settleMealDelivery({ orderId: e._id, driverId: d._id })).bonuses, [], 'only one lunch so far');
});

test('slot_coverage: distinct days worked in the slot this week', async () => {
    await rate({ ratePln: 8 });
    await promo({ type: 'slot_coverage', slotKey: 'lunch', targetCount: 2, bonusPln: 80 });
    const d = await driver();
    const monday = svc.weekStartOf(today());
    const day1 = await delivered(d, { deliveryDate: monday });
    const day1b = await delivered(d, { deliveryDate: monday });
    const day2 = await delivered(d, { deliveryDate: tm.addDays(monday, 1) });
    assert.deepEqual((await svc.settleMealDelivery({ orderId: day1._id, driverId: d._id })).bonuses, []);
    assert.deepEqual((await svc.settleMealDelivery({ orderId: day1b._id, driverId: d._id })).bonuses, [], 'a second delivery the same day is still one day');
    const paid = await svc.settleMealDelivery({ orderId: day2._id, driverId: d._id });
    assert.equal(paid.bonuses.length, 1);
    assert.equal(paid.riderEarning, 8 + 80);
});

test('zone_coverage: paid when every delivery of the zone and slot that day is delivered and none failed', async () => {
    await rate({ ratePln: 8 });
    await promo({ type: 'zone_coverage', zoneId: w.zone._id, slotKey: 'lunch', bonusPln: 50, targetCount: 0 });
    const d = await driver();
    const a = await delivered(d);
    const b = await delivered(d, { status: 'out_for_delivery' });
    assert.deepEqual((await svc.settleMealDelivery({ orderId: a._id, driverId: d._id })).bonuses, [], 'one is still out for delivery');
    await w.DMBDailyOrder.updateOne({ _id: b._id }, { $set: { status: 'delivered' } });
    assert.equal((await svc.settleMealDelivery({ orderId: b._id, driverId: d._id })).bonuses.length, 1);

    // a failed delivery in the zone and slot spoils the day
    const d2 = await driver();
    await models.DMBPromotionAward.deleteMany({});
    await w.DMBDailyOrder.deleteMany({});
    const ok = await delivered(d2, { deliveryDate: tm.addDays(today(), 1) });
    await delivered(d2, { deliveryDate: tm.addDays(today(), 1), status: 'failed' });
    await w.DMBDailyOrder.updateOne({ _id: ok._id }, { $set: { status: 'delivered' } });
    const res = await svc.settleMealDelivery({ orderId: ok._id, driverId: d2._id });
    assert.equal(res.bonuses.length, 0, 'a failed delivery means the zone was not fully delivered');
});

test('a pantry bag is paid by its shop zone and counts towards the weekly target', async () => {
    await rate({ zoneId: w.zone._id, ratePln: 7 });
    await promo({ targetCount: 2, bonusPln: 10 });
    const d = await driver();
    const bag = () => new mongoose.Types.ObjectId();
    const ids = [bag(), bag()];
    await PantryOrder.collection.insertOne({
        orderId: 'PO-E1', userId: w.user._id, vendorId: w.vendor._id, status: 'paid', items: [], deliveryAddress: { street: 'x', city: 'y', state: 'z' },
        dailyDeliveries: ids.map((_id) => ({ _id, date: today(), slot: 'lunch', status: 'delivered', driverId: d._id }))
    });
    assert.deepEqual((await svc.settlePantryDelivery({ deliveryId: ids[0], driverId: d._id })).bonuses, []);
    const second = await svc.settlePantryDelivery({ deliveryId: ids[1], driverId: d._id });
    assert.equal(second.riderEarning, 7 + 10);
    await assert.rejects(svc.settlePantryDelivery({ deliveryId: ids[1], driverId: d._id }), (e) => e.code === 'ALREADY_CONFIRMED');
    const stored = (await PantryOrder.findOne({ orderId: 'PO-E1' }).lean()).dailyDeliveries.find((x) => String(x._id) === String(ids[1]));
    assert.equal(stored.riderEarning, 17);
    assert.equal(stored.earningBreakdown.bonuses.length, 1);
});

test('driver progress: this week toward the target, with the achieved flag once paid', async () => {
    await rate({ ratePln: 8 });
    const p = await promo({ targetCount: 2, bonusPln: 30, name: 'Weekly 2' });
    const d = await driver();
    let list = await svc.promotionsForDriver({ driverId: d._id, zoneIds: [String(w.zone._id)] });
    assert.deepEqual([list[0].name, list[0].current, list[0].target, list[0].achieved], ['Weekly 2', 0, 2, false]);
    const a = await delivered(d); const b = await delivered(d);
    await svc.settleMealDelivery({ orderId: a._id, driverId: d._id });
    list = await svc.promotionsForDriver({ driverId: d._id, zoneIds: [String(w.zone._id)] });
    assert.equal(list[0].current, 1);
    await svc.settleMealDelivery({ orderId: b._id, driverId: d._id });
    list = await svc.promotionsForDriver({ driverId: d._id, zoneIds: [String(w.zone._id)] });
    assert.deepEqual([list[0].current, list[0].achieved], [2, true]);
    // another city's promotion is not shown
    const otherCity = await w.AdminCity.create({ name: `Elsewhere ${Date.now()}`, country: 'PL', currency: 'PLN', status: 'active', zoneIds: [] });
    await models.DMBDriverPromotion.create({ name: 'Elsewhere', type: 'delivery_count', targetCount: 1, bonusPln: 5, cityId: otherCity._id, validFrom: tm.addDays(today(), -1), validUntil: tm.addDays(today(), 5), status: 'active' });
    list = await svc.promotionsForDriver({ driverId: d._id, zoneIds: [String(w.zone._id)] });
    assert.deepEqual(list.map((x) => x.name), ['Weekly 2']);
    assert.ok(p);
});
