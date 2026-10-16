/**
 * Hubs and cross-zone delivery: when a vendor in another zone can serve a customer, the flat surcharge, the transfer that is created,
 * who collects at the vendor, the two-PIN hand-over (PIN 2 only after PIN 1), hub-stop pay, and the alerts around it.
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/hubs.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connect, disconnect, seedWorld, setControl, clearControls, nextPhone, nextWeekday, WARSAW, acceptAssignment } from './helpers/amendmentFixtures.mjs';

let w, hub, planner, pricing, checkout, subSvc, earnings, models, DMBHubTransfer, CollectionBatch, DMBAdminAlert, tm, tomorrow;

before(async () => {
    await connect('hubs_test');
    w = await seedWorld();
    hub = await import('../src/modules/dailymealbox/delivery/hub.service.js');
    planner = await import('../src/modules/dailymealbox/delivery/cellPlanner.service.js');
    pricing = await import('../src/modules/dailymealbox/subscription/pricing.service.js');
    checkout = await import('../src/modules/dailymealbox/subscription/subscriptionCheckout.service.js');
    subSvc = await import('../src/modules/dailymealbox/subscription/subscription.service.js');
    earnings = await import('../src/modules/dailymealbox/delivery/driverEarnings.service.js');
    models = await import('../src/modules/dailymealbox/delivery/driverEarnings.models.js');
    ({ DMBHubTransfer } = await import('../src/modules/dailymealbox/delivery/hub.models.js'));
    ({ CollectionBatch } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js'));
    ({ DMBAdminAlert } = await import('../src/modules/dailymealbox/platform/platform.models.js'));
    tm = await import('../src/utils/platformTime.js');
    tomorrow = tm.addDays(tm.localToday(), 1);
    await w.DeliverySlot.create({ key: 'lunch', name: 'Lunch', startTime: '08:00', endTime: '14:00', maxPrepMinutes: 60, driverStartTime: '12:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true });
    await w.DeliverySlot.create({ key: 'dinner', name: 'Dinner', startTime: '16:00', endTime: '20:00', maxPrepMinutes: 60, availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true });
});
after(disconnect);

const ymd = (d) => tm.storageDateStr(d);
let hubVendor;

beforeEach(async () => {
    const { ShiftRecord } = await import('../src/modules/food/delivery/models/shiftRecord.model.js');
    await Promise.all([
        DMBHubTransfer.deleteMany({}), CollectionBatch.deleteMany({}), ShiftRecord.deleteMany({}), DMBAdminAlert.deleteMany({}), w.DMBDailyOrder.deleteMany({}),
        w.FoodDeliveryPartner.deleteMany({}), w.DMBSubscription.deleteMany({}), models.DMBDeliveryRate.deleteMany({}), models.DMBDriverPromotion.deleteMany({}), models.DMBPromotionAward.deleteMany({})
    ]);
    await clearControls();
    await setControl('weekendDelivery', { saturday: true, sunday: true });
    await setControl('maxSlotsPerDay', { value: 3 });
    await setControl('crossZoneDelivery', { enabled: true, surchargePln: 3 });
    await w.FoodRestaurant.updateMany({}, { $set: { isHub: false } });
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: true, hubOperatorName: 'Jan', hubCapacity: null } });
    hubVendor = await w.FoodRestaurant.findById(w.vendor2._id).lean();
    await earnings.saveRate({ ratePln: 8, hubStopRate: 3, effectiveFrom: '2000-01-01' });
});

const driver = (zone, name) => w.FoodDeliveryPartner.create({ name, phone: nextPhone(), status: 'approved', zoneIds: [zone._id], primaryZoneId: zone._id });
const accept = (d, zone) => acceptAssignment(d, { zoneId: zone._id, slotKeys: ['lunch'], days: [1] });
const customer = () => w.FoodUser.create({ phone: nextPhone(), name: 'Anna', role: 'USER' });
const crossOrder = async (user, over = {}) => w.DMBDailyOrder.create({
    orderType: 'subscription', subscriptionId: new mongoose.Types.ObjectId(), userId: user._id, vendorId: w.farVendor._id, zoneId: w.zone._id,
    meals: [{ name: 'Pierogi', quantity: 1 }], deliveryDate: tomorrow, deliverySlot: 'lunch', status: 'scheduled', deliveryPin: '4321',
    deliveryAddress: { street: 'Marszalkowska 1', city: 'Warsaw', state: 'Mazowieckie', location: { type: 'Point', coordinates: [WARSAW.lng, WARSAW.lat] } }, ...over
});
const cell = { get zoneId() { return w.zone._id; }, get date() { return ymd(tomorrow); }, slotKey: 'lunch' };
const world = async () => {
    const source = await driver(w.zone2, 'Source'); const zoneDriver = await driver(w.zone, 'ZoneDriver');
    await accept(source, w.zone2); await accept(zoneDriver, w.zone);
    const order = await crossOrder(await customer());
    await planner.splitCell(cell);
    const transfer = await DMBHubTransfer.findOne({ unitId: order._id });
    return { source, zoneDriver, order, transfer };
};
const pinOf = async (transfer, which) => (await hub.hubBoard({ hubVendorId: hubVendor._id }))[which === 'drop' ? 'incoming' : 'holding'].find((x) => String(x.transferId) === String(transfer._id))?.[which === 'drop' ? 'dropPin' : 'pickupPin'];
const collect = async (src, order) => hub.markCollectedForHub({ unitIds: [String(order._id)], driverId: src._id });

test('feasibility: switched off, no hub, slot without a driver start, too far for the time, and the happy path', async () => {
    const vendor = await w.FoodRestaurant.findById(w.farVendor._id).lean();
    const check = (slotKey = 'lunch') => hub.crossZoneFeasibility({ vendor, customerZoneId: w.zone._id, slotKey });
    await setControl('crossZoneDelivery', { enabled: false, surchargePln: 3 });
    assert.equal((await check()).code, 'CROSS_ZONE_DISABLED');
    await setControl('crossZoneDelivery', { enabled: true, surchargePln: 3 });
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: false } });
    assert.equal((await check()).code, 'NO_HUB');
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: true } });
    assert.equal((await check('dinner')).code, 'SLOT_NOT_CONFIGURED', 'a slot with no driver start cannot carry cross-zone items');
    await setControl('hubOperations', { travelSpeedKmh: 5, handoffBufferMinutes: 15, maxHoldingMinutes: 60, dropPinHours: 2, pickupPinHours: 4, defaultCapacity: 50 });
    assert.equal((await check()).code, 'TOO_LATE');
    await setControl('hubOperations', { travelSpeedKmh: 20, handoffBufferMinutes: 15, maxHoldingMinutes: 60, dropPinHours: 2, pickupPinHours: 4, defaultCapacity: 50 });
    const ok = await check();
    assert.equal(ok.ok, true);
    assert.equal(String(ok.hub._id), String(w.vendor2._id));
    assert.equal(ok.surchargePln, 3);
    assert.ok(ok.travelMinutes > 0 && ok.travelMinutes < 120);
});

test('checkout: the flat surcharge is charged once per slot, outside every discount, and a second plan in the same slot adds none', async () => {
    const start = await nextWeekday(1, 2);
    const base = (over = {}) => ({
        subscriptionPlanId: String(w.plans.weekMF._id), vendorId: String(w.farVendor._id), zoneId: String(w.zone._id),
        meals: [{ mealPlanId: String(w.farMeal._id), quantity: 1 }], deliverySlots: ['lunch'], startDate: start, ...over
    });
    await setControl('crossZoneDelivery', { enabled: false, surchargePln: 3 });
    await assert.rejects(pricing.quoteSubscription(base(), { userId: w.user._id }), /does not deliver to your zone/);
    await setControl('crossZoneDelivery', { enabled: true, surchargePln: 3 });
    const q = await pricing.quoteSubscription(base(), { userId: w.user._id });
    assert.equal(q.crossZone, true);
    assert.equal(q.totals.crossZoneSurcharge, 15, '5 slot-days x 3');
    assert.ok(q.lines.some((l) => l.key === 'cross_zone_surcharge' && l.amount === 15));
    const parts = q.totals.food + q.totals.foodVat + q.totals.delivery + q.totals.crossZoneSurcharge + q.totals.deliveryVat + q.totals.platformFee;
    assert.ok(Math.abs(q.totals.total - parts) < 0.011, `the total (${q.totals.total}) is the sum of its parts (${parts}) including the surcharge`);
    const noDiscountSurcharge = await pricing.quoteSubscription({ subscriptionPlanId: String(w.plans.weekMF._id), vendorId: String(w.farVendor._id), zoneId: String(w.zone._id), meals: [{ mealPlanId: String(w.farMeal._id), quantity: 1 }], deliverySlots: ['lunch'], startDate: start }, { userId: null });
    assert.equal(noDiscountSurcharge.totals.crossZoneSurcharge, 15);
    assert.equal(q.totals.deliveryVat, Math.round((q.totals.delivery * 0.23 + 15 * 0.23) * 100) / 100, 'delivery VAT applies to the surcharge too');

    const { subscription } = await checkout.createPendingSubscription({ userId: w.user._id, input: base(), deliveryAddress: w.address });
    await subSvc.activateSubscription(subscription.subscriptionId);
    const second = await pricing.quoteSubscription(base({ meals: [{ mealPlanId: String(w.farMeal._id), quantity: 2 }] }), { userId: w.user._id });
    assert.equal(second.totals.crossZoneSurcharge, 0, 'the slot already pays the surcharge');
    assert.equal(second.deliveryFeeWaivedCount, 5);
    // the generated order of a surcharged day carries it
    const day = q.crossZoneSurchargeKeys[0].split(':')[0];
    const sub = await w.DMBSubscription.findById(subscription._id).lean();
    const fee = pricing.priceDailyOrder(sub, new Date(day), { slot: 'lunch', meals: [{ mealPlanId: w.farMeal._id, quantity: 1 }] }).deliveryFee;
    assert.equal(fee, 5 + 3);
});

test('checkout refuses a cross-zone vendor when the slot cannot be served in time; with no hub the maker simply does not deliver to the customer', async () => {
    const start = await nextWeekday(1, 2);
    const input = { subscriptionPlanId: String(w.plans.weekMF._id), vendorId: String(w.farVendor._id), zoneId: String(w.zone._id), meals: [{ mealPlanId: String(w.farMeal._id), quantity: 1 }], deliverySlots: ['dinner'], startDate: start };
    await assert.rejects(pricing.quoteSubscription(input, { userId: w.user._id }), (e) => e.code === 'CROSS_ZONE_SLOT_NOT_CONFIGURED');
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: false } });
    await assert.rejects(pricing.quoteSubscription({ ...input, deliverySlots: ['lunch'] }, { userId: w.user._id }), (e) => e.code === 'ZONE_MISMATCH' && /does not deliver to your zone/.test(e.message));
});

test('a cross-zone item gets a transfer: the source driver of the vendor zone, the zone driver of the customer, PIN 1 stored hashed and encrypted', async () => {
    const { source, zoneDriver, order, transfer } = await world();
    assert.ok(transfer, 'a transfer exists');
    assert.equal(String(transfer.hubVendorId), String(w.vendor2._id));
    assert.equal(String(transfer.sourceZoneId), String(w.zone2._id));
    assert.equal(String(transfer.destZoneId), String(w.zone._id));
    assert.equal(String(transfer.sourceDriverId), String(source._id), 'a driver of the vendor zone carries it to the hub');
    assert.equal(String(transfer.zoneDriverId), String(zoneDriver._id), 'a driver of the customer zone delivers it');
    assert.equal(transfer.status, 'pending_drop');
    assert.equal(transfer.pickupPinHash, '', 'PIN 2 does not exist yet');
    const raw = JSON.stringify(transfer);
    assert.match(transfer.dropPinHash, /^[0-9a-f]{64}$/);
    assert.match(transfer.dropPinEnc, /^enc:v1:/);
    assert.equal((await w.DMBDailyOrder.findById(order._id).lean()).hasCrossZone, true);
    assert.ok(!/"dropPin":"\d{4}"/.test(raw), 'no plaintext PIN in the stored document');
    await planner.splitCell(cell);
    assert.equal(await DMBHubTransfer.countDocuments({}), 1, 'idempotent');
});

test('transfers are not made when cross-zone delivery is switched off, and each blocker raises an alert', async () => {
    await setControl('crossZoneDelivery', { enabled: false, surchargePln: 3 });
    await crossOrder(await customer());
    await planner.splitCell(cell);
    assert.equal(await DMBHubTransfer.countDocuments({}), 0);
    await setControl('crossZoneDelivery', { enabled: true, surchargePln: 3 });

    await planner.splitCell(cell); // enabled, but nobody accepted the vendor zone
    assert.equal(await DMBHubTransfer.countDocuments({}), 0);
    assert.equal((await DMBAdminAlert.findOne({ type: 'hub_source_driver_missing' }))?.severity, 'critical');

    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: false } });
    await planner.splitCell(cell);
    assert.equal((await DMBAdminAlert.findOne({ type: 'hub_missing' }))?.severity, 'critical');

    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: true, hubCapacity: 1 } });
    const src = await driver(w.zone2, 'Source'); await accept(src, w.zone2);
    await crossOrder(await customer());
    await planner.splitCell(cell);
    assert.equal(await DMBHubTransfer.countDocuments({}), 1, 'the hub holds one item (its capacity) and the rest wait');
    assert.equal((await DMBAdminAlert.findOne({ type: 'hub_full' }))?.severity, 'warning');
});

test('dispatch: the vendor pickup goes to the source driver, not to the zone driver who will deliver', async () => {
    const { source, zoneDriver, order, transfer } = await world();
    await w.DMBDailyOrder.updateOne({ _id: order._id }, { $set: { status: 'ready' } });
    const { triggerDriverNotificationIfAllReady } = await import('../src/modules/dailymealbox/subscription/dmb.dailyOrder.service.js');
    await triggerDriverNotificationIfAllReady(w.farVendor._id, tomorrow, 'lunch');
    const batches = await CollectionBatch.find({ vendorId: w.farVendor._id });
    assert.equal(batches.length, 1);
    assert.equal(String(batches[0].driverId), String(source._id));
    assert.ok(batches[0].orderIds.map(String).includes(String(order._id)));
    assert.equal(await CollectionBatch.countDocuments({ driverId: zoneDriver._id }), 0);
    assert.ok(transfer);
});

test('the full hand-over: collect, PIN 1 at the hub, PIN 2 only afterwards, then the zone driver carries it to the customer', async () => {
    const { source, zoneDriver, order, transfer } = await world();

    // PIN 2 does not work before the item is at the hub
    await assert.rejects(hub.pickupAtHub({ transferId: transfer._id, driverId: zoneDriver._id, pin: '0000' }), (e) => e.code === 'NOT_AT_HUB');
    // and nothing can be dropped before the source driver has collected it
    await assert.rejects(hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin: '0000' }), (e) => e.code === 'NOT_COLLECTED');

    assert.deepEqual(await collect(source, order), [String(order._id)]);
    assert.equal((await w.DMBDailyOrder.findById(order._id).lean()).status, 'hub_transit');
    const tasks = await hub.driverHubTasks({ driverId: source._id });
    assert.deepEqual(tasks.map((t) => [t.type, t.collected]), [['hub_dropoff', true]]);
    assert.deepEqual((await hub.driverHubTasks({ driverId: zoneDriver._id })).map((t) => [t.type, t.atHub]), [['hub_pickup', false]]);

    const board = await hub.hubBoard({ hubVendorId: hubVendor._id });
    assert.equal(board.incoming.length, 1, 'the hub operator sees the driver on the way');
    const pin1 = board.incoming[0].dropPin;
    assert.match(pin1, /^\d{4}$/);

    await assert.rejects(hub.dropAtHub({ transferId: transfer._id, driverId: zoneDriver._id, pin: pin1 }), (e) => e.code === 'NOT_YOURS');
    await assert.rejects(hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin: pin1 === '0000' ? '1111' : '0000' }), (e) => e.code === 'WRONG_PIN');
    const dropped = await hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin: pin1 });
    assert.equal(dropped.status, 'holding');
    assert.equal(dropped.earning, 3, 'a hub stop pays its own flat rate, at once');
    assert.equal((await w.FoodDeliveryPartner.findById(source._id).lean()).earningsToday, 3);
    await assert.rejects(hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin: pin1 }), (e) => e.code === 'WRONG_STATE', 'a replay changes nothing');
    assert.equal((await w.FoodDeliveryPartner.findById(source._id).lean()).earningsToday, 3, 'no double credit');

    const holding = (await hub.hubBoard({ hubVendorId: hubVendor._id })).holding;
    assert.equal(holding.length, 1);
    const pin2 = holding[0].pickupPin;
    assert.match(pin2, /^\d{4}$/);
    assert.equal((await hub.hubBoard({ hubVendorId: hubVendor._id })).incoming.length, 0);

    await assert.rejects(hub.pickupAtHub({ transferId: transfer._id, driverId: source._id, pin: pin2 }), (e) => e.code === 'NOT_YOURS');
    await assert.rejects(hub.pickupAtHub({ transferId: transfer._id, driverId: zoneDriver._id, pin: pin2 === '0000' ? '1111' : '0000' }), (e) => e.code === 'WRONG_PIN');
    const picked = await hub.pickupAtHub({ transferId: transfer._id, driverId: zoneDriver._id, pin: pin2 });
    assert.equal(picked.status, 'picked_up');
    const unit = await w.DMBDailyOrder.findById(order._id).lean();
    assert.equal(unit.status, 'out_for_delivery');
    assert.equal(String(unit.dispatch.deliveryPartnerId), String(zoneDriver._id));
    const batch = await CollectionBatch.findOne({ driverId: zoneDriver._id, status: 'collected' });
    assert.ok(batch && batch.orderIds.map(String).includes(String(order._id)), 'a collected batch puts it on the zone driver route');
    await assert.rejects(hub.pickupAtHub({ transferId: transfer._id, driverId: zoneDriver._id, pin: pin2 }), (e) => e.code === 'WRONG_STATE');
    assert.equal((await hub.hubBoard({ hubVendorId: hubVendor._id })).completedToday, 1);

    // the hub stop shows in the source driver's shift earnings (not as a delivery)
    const { shiftStats } = await import('../src/modules/food/delivery/services/attendance.service.js');
    const shiftRow = { driverId: source._id, date: new Date(`${ymd(tomorrow)}T00:00:00.000Z`), slotKey: 'lunch' };
    assert.deepEqual(await shiftStats(shiftRow), { deliveries: 0, earnings: 3 });

    // delivered: the zone driver is paid the delivery rate, the source driver keeps only the hub stop
    await w.DMBDailyOrder.updateOne({ _id: order._id }, { $set: { status: 'delivered' } });
    assert.equal((await earnings.settleMealDelivery({ orderId: order._id, driverId: zoneDriver._id })).riderEarning, 8);
});

test('PINs lock after three wrong attempts (admin alerted) until admin issues a new one; an expired PIN needs a new one too', async () => {
    const { source, order, transfer } = await world();
    await collect(source, order);
    const pin = await pinOf(transfer, 'drop');
    const wrong = pin === '0000' ? '1111' : '0000';
    for (let i = 0; i < 2; i += 1) await assert.rejects(hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin: wrong }), (e) => e.code === 'WRONG_PIN');
    await assert.rejects(hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin: wrong }), (e) => e.code === 'PIN_LOCKED');
    await assert.rejects(hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin }), (e) => e.code === 'PIN_LOCKED', 'even the right PIN is refused once locked');
    assert.equal((await DMBAdminAlert.findOne({ type: 'hub_pin_locked' }))?.severity, 'warning');
    assert.equal((await hub.hubBoard({ hubVendorId: hubVendor._id })).incoming[0].locked, true);

    await hub.regeneratePin({ transferId: transfer._id, which: 'drop' });
    const fresh = await pinOf(transfer, 'drop');
    assert.equal((await hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin: fresh })).status, 'holding');

    // expiry (a second item)
    const second = await crossOrder(await customer());
    await planner.splitCell(cell);
    const t2 = await DMBHubTransfer.findOne({ unitId: second._id });
    await collect(source, second);
    const p2 = await pinOf(t2, 'drop');
    await DMBHubTransfer.updateOne({ _id: t2._id }, { $set: { dropPinExpiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(hub.dropAtHub({ transferId: t2._id, driverId: source._id, pin: p2 }), (e) => e.code === 'PIN_EXPIRED');
    await hub.regeneratePin({ transferId: t2._id, which: 'drop' });
    assert.equal((await hub.dropAtHub({ transferId: t2._id, driverId: source._id, pin: await pinOf(t2, 'drop') })).status, 'holding');
});

test('the PIN lifetimes and the holding limit come from the admin control', async () => {
    await setControl('hubOperations', { travelSpeedKmh: 20, handoffBufferMinutes: 15, maxHoldingMinutes: 30, dropPinHours: 3, pickupPinHours: 5, defaultCapacity: 50 });
    const { source, order, transfer } = await world();
    const t0 = new Date();
    await collect(source, order);
    const afterCollect = await DMBHubTransfer.findById(transfer._id).lean();
    assert.ok(Math.abs((afterCollect.dropPinExpiresAt - t0) / 3_600_000 - 3) < 0.02, 'PIN 1 lives 3h from the collection');
    await hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin: await pinOf(transfer, 'drop') });
    const held = await DMBHubTransfer.findById(transfer._id).lean();
    assert.ok(Math.abs((held.pickupPinExpiresAt - held.dropConfirmedAt) / 3_600_000 - 5) < 0.02, 'PIN 2 lives 5h');
    assert.ok(Math.abs((held.holdingDeadline - held.dropConfirmedAt) / 60_000 - 30) < 0.5, 'held items are flagged after 30 minutes');
});

test('no hub stop rate: the drop still happens, nothing is credited, admin is alerted; a hub bonus is added when earned', async () => {
    const { source, order, transfer } = await world();
    await models.DMBDeliveryRate.updateMany({}, { $set: { hubStopRate: null } });
    await collect(source, order);
    const res = await hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin: await pinOf(transfer, 'drop') });
    assert.equal(res.earning, 0);
    assert.equal((await DMBAdminAlert.findOne({ type: 'hub_rate_missing' }))?.severity, 'critical');
    assert.equal((await w.FoodDeliveryPartner.findById(source._id).lean()).earningsToday || 0, 0);

    await models.DMBDeliveryRate.updateMany({}, { $set: { hubStopRate: 3 } });
    await earnings.savePromotion({ name: 'Hub 1', type: 'hub_bonus', targetCount: 1, bonusPln: 10, validFrom: ymd(tm.addDays(tm.localToday(), -3)), validUntil: ymd(tm.addDays(tm.localToday(), 3)), status: 'active' });
    const second = await crossOrder(await customer());
    await planner.splitCell(cell);
    const t2 = await DMBHubTransfer.findOne({ unitId: second._id });
    await collect(source, second);
    const paid = await hub.dropAtHub({ transferId: t2._id, driverId: source._id, pin: await pinOf(t2, 'drop') });
    assert.equal(paid.earning, 13, 'the 3 hub stop pay plus the 10 hub bonus');
    assert.equal(paid.bonuses.length, 1);
});

test('sweep: an item held too long, or a drop-off PIN that ran out, alerts admin once', async () => {
    const { source, order, transfer } = await world();
    await collect(source, order);
    await DMBHubTransfer.updateOne({ _id: transfer._id }, { $set: { dropPinExpiresAt: new Date(Date.now() - 1000) } });
    const first = await hub.sweepHubs();
    assert.equal(first.expired, 1);
    assert.equal((await hub.sweepHubs()).expired, 0, 'once');
    await hub.regeneratePin({ transferId: transfer._id, which: 'drop' });
    await hub.dropAtHub({ transferId: transfer._id, driverId: source._id, pin: await pinOf(transfer, 'drop') });
    await DMBHubTransfer.updateOne({ _id: transfer._id }, { $set: { holdingDeadline: new Date(Date.now() - 1000) } });
    assert.equal((await hub.sweepHubs()).overdue, 1);
    assert.equal((await hub.sweepHubs()).overdue, 0, 'once');
    assert.equal((await DMBAdminAlert.findOne({ type: 'hub_holding_overdue' }))?.severity, 'critical');
});

test('the hub operator sees only its own hub; the admin monitor lists the day, scoped by zone', async () => {
    const { order } = await world();
    const otherHub = await w.FoodRestaurant.create({ restaurantName: 'Other Hub', ownerName: 'X', ownerPhone: nextPhone(), status: 'approved', zoneId: w.zone._id, isHub: true });
    const board = await hub.hubBoard({ hubVendorId: otherHub._id });
    assert.deepEqual([board.incoming.length, board.holding.length, board.expected.length, board.completedToday], [0, 0, 0, 0]);
    const mine = await hub.hubBoard({ hubVendorId: hubVendor._id });
    assert.equal(mine.expected.length, 1, 'expected: assigned but not yet collected');
    assert.equal(mine.expected[0].orderId, order.orderId);
    assert.equal(mine.expected[0].dropPin, undefined, 'no PIN is shown before the driver is on the way');
    const all = await hub.adminTransfers({ date: ymd(tomorrow) });
    assert.equal(all.length, 1);
    assert.deepEqual([all[0].hub, all[0].from, all[0].sourceDriver, all[0].zoneDriver], ['Bistro Centrum', 'South Diner', 'Source', 'ZoneDriver']);
    assert.equal((await hub.adminTransfers({ date: ymd(tomorrow), zoneIds: [String(new mongoose.Types.ObjectId())] })).length, 0);
});

test('a single meal from another zone: refused while cross-zone is off; with it on it is listed, priced with the surcharge once per slot, and becomes a hub item when paid', async () => {
    const oneTime = await import('../src/modules/dailymealbox/orders/oneTimeOrder.service.js');
    const { DMBOneTimeOrder } = await import('../src/modules/dailymealbox/orders/orders.models.js');
    await setControl('selectMode', { enabled: true });
    await w.FoodRestaurant.updateOne({ _id: w.farVendor._id }, { $set: { deliveryWeekdays: [0, 1, 2, 3, 4, 5, 6] } });
    const user = await w.FoodUser.create({
        phone: nextPhone(), name: 'Single', role: 'USER',
        addresses: [{ label: 'Home', street: 'Marszalkowska 1', city: 'Warsaw', state: 'Mazowieckie', zipCode: '00-001', phone: '+48500500500', location: { type: 'Point', coordinates: [WARSAW.lng, WARSAW.lat] } }]
    });
    const addressId = String((await w.FoodUser.findById(user._id).lean()).addresses[0]._id);
    const date = ymd(tomorrow);
    const order = (qty = 1) => oneTime.createSelectOrder({ userId: user._id, mealPlanId: w.farMeal._id, quantity: qty, date, slot: 'lunch', addressId });
    const browse = () => oneTime.browseSelectMeals({ zoneId: w.zone._id, date, slot: 'lunch' });

    await setControl('crossZoneDelivery', { enabled: false, surchargePln: 3 });
    await assert.rejects(order(), (e) => e.code === 'ZONE_MISMATCH');
    assert.ok(!(await browse()).meals.some((m) => String(m.mealPlanId) === String(w.farMeal._id)), 'not listed while off');

    await setControl('crossZoneDelivery', { enabled: true, surchargePln: 3 });
    const listed = (await browse()).meals.find((m) => String(m.mealPlanId) === String(w.farMeal._id));
    assert.ok(listed, 'listed once a hub can serve the slot');
    assert.deepEqual([listed.crossZone, listed.crossZoneSurchargePln], [true, 3]);

    const first = await order();
    assert.equal(first.crossZone, true);
    assert.equal(first.pricing.crossZoneSurcharge, 3);
    const p = first.pricing;
    assert.ok(Math.abs(p.totalPrice - (p.foodCost + p.foodVatAmount + p.deliveryFee + p.crossZoneSurcharge + p.deliveryVatAmount)) < 0.011, 'the total includes the surcharge');
    assert.ok(p.deliveryVatAmount >= Math.round((p.deliveryFee + 3) * p.deliveryVat) / 100 - 0.011, 'delivery VAT applies to the surcharge');

    const second = await order(2);
    assert.equal(second.pricing.crossZoneSurcharge, 0, 'the slot already pays the surcharge');

    // paid: it becomes a daily order that carries the surcharge and, once split, a hub transfer
    const { fulfilOneTimeOrder } = oneTime;
    await fulfilOneTimeOrder(first._id, { paidWith: 'online', transactionId: 'tx-1' });
    const paidOrder = await DMBOneTimeOrder.findById(first._id).lean();
    const daily = await w.DMBDailyOrder.findById(paidOrder.dailyOrderId).lean();
    assert.equal(daily.hasCrossZone, true);
    assert.equal(daily.pricing.crossZoneSurcharge, 3);
    assert.equal(String(daily.zoneId), String(w.zone._id));
    const src = await driver(w.zone2, 'Source'); await accept(src, w.zone2);
    await planner.splitCell(cell);
    assert.ok(await DMBHubTransfer.findOne({ unitId: daily._id }), 'a hub transfer carries it');
    await w.DMBDailyOrder.deleteMany({ orderType: 'one_time_select' });
    await DMBOneTimeOrder.deleteMany({});
});

test('the city is the main zone: the plans browser lists makers of the other sub-zones of the SAME city through the hub, never another city', async () => {
    const { browseVendors, vendorMeals } = await import('../src/modules/dailymealbox/customer/browse.service.js');
    const KRAKOW = { lat: 50.0647, lng: 19.945 };
    const square = (c, d) => [
        { latitude: c.lat - d, longitude: c.lng - d }, { latitude: c.lat - d, longitude: c.lng + d },
        { latitude: c.lat + d, longitude: c.lng + d }, { latitude: c.lat + d, longitude: c.lng - d }
    ];
    const zone3 = await w.FoodZone.create({ name: `Krakow Centre ${Date.now()}`, country: 'Poland', coordinates: square(KRAKOW, 0.05) });
    await w.AdminCity.create({ name: `Krakow ${Date.now()}`, country: 'PL', currency: 'PLN', status: 'active', zoneIds: [zone3._id] });
    const foreign = await w.FoodRestaurant.create({
        restaurantName: 'Krakow Kitchen', ownerName: 'K', ownerPhone: nextPhone(), status: 'approved', zoneId: zone3._id, vendorType: 'restaurant',
        location: { type: 'Point', coordinates: [KRAKOW.lng, KRAKOW.lat], latitude: KRAKOW.lat, longitude: KRAKOW.lng }
    });
    const ids = async () => (await browseVendors({ zoneId: w.zone._id })).vendors.map((v) => String(v.vendorId || v._id || v.id));
    const findFar = async () => (await browseVendors({ zoneId: w.zone._id })).vendors.find((v) => String(v.vendorId || v._id || v.id) === String(w.farVendor._id));

    const far = await findFar();
    assert.ok(far, 'a maker of another sub-zone of the same city is listed');
    assert.deepEqual([far.crossZone, far.crossZoneSurchargePln], [true, 3]);
    const own = (await browseVendors({ zoneId: w.zone._id })).vendors.find((v) => String(v.vendorId || v._id || v.id) === String(w.vendor._id));
    assert.equal(own.crossZone, false, 'a maker of the own sub-zone is not flagged');
    assert.ok(!(await ids()).includes(String(foreign._id)), 'a maker of another city is never listed');

    // the meal list of that maker opens for this customer, and the other city's does not
    await vendorMeals({ vendorId: w.farVendor._id, zoneId: w.zone._id });
    await assert.rejects(vendorMeals({ vendorId: foreign._id, zoneId: w.zone._id }), (e) => e.code === 'ZONE_MISMATCH');
    assert.equal((await hub.crossZoneFeasibility({ vendor: foreign, customerZoneId: w.zone._id, slotKey: 'lunch' })).code, 'DIFFERENT_CITY');

    // without a hub in the customer's sub-zone, or with the switch off, nothing from other sub-zones is offered
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: false } });
    assert.equal(await findFar(), undefined);
    await assert.rejects(vendorMeals({ vendorId: w.farVendor._id, zoneId: w.zone._id }), (e) => e.code === 'ZONE_MISMATCH');
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: true } });
    await setControl('crossZoneDelivery', { enabled: false, surchargePln: 3 });
    assert.equal(await findFar(), undefined);
    await w.FoodRestaurant.deleteOne({ _id: foreign._id });
});

test('an address outside every sub-zone of every city cannot use the system at all', async () => {
    const { assertAddressInZone } = await import('../src/modules/dailymealbox/zones/zoneGeo.service.js');
    await assert.rejects(assertAddressInZone({ street: 'Nowhere', city: 'Gdansk', location: { type: 'Point', coordinates: [18.6466, 54.352] } }, { source: 'checkout' }), /outside our delivery area/);
    assert.ok(await assertAddressInZone({ street: 'Home', city: 'Warsaw', location: { type: 'Point', coordinates: [WARSAW.lng, WARSAW.lat] } }, { source: 'checkout' }));
});
