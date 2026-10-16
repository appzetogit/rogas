/**
 * One delivery fee per slot: fee precedence (zone override > slot fee > platform fee), and a delivery that rides on a trip the
 * customer already has (another plan, a single meal, a pantry bag) in the same zone, day and slot costs no second fee —
 * decided by who bought first, so plans never cover each other into a free ride.
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/slotFee.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connect, disconnect, seedWorld, setControl, clearControls, nextWeekday } from './helpers/amendmentFixtures.mjs';

let w, pricing, checkout, subSvc, slotSvc, bundling, zoneFees, time;

before(async () => {
    await connect('slot_fee_test');
    w = await seedWorld();
    pricing = await import('../src/modules/dailymealbox/subscription/pricing.service.js');
    checkout = await import('../src/modules/dailymealbox/subscription/subscriptionCheckout.service.js');
    subSvc = await import('../src/modules/dailymealbox/subscription/subscription.service.js');
    slotSvc = await import('../src/modules/dailymealbox/deliverySlot/deliverySlot.service.js');
    bundling = await import('../src/modules/dailymealbox/subscription/deliveryBundling.js');
    zoneFees = await import('../src/modules/dailymealbox/platform/zoneFee.js');
    time = await import('../src/utils/platformTime.js');
    await slotSvc.listSlots(); // seeds breakfast / lunch / dinner
});
after(disconnect);

beforeEach(async () => {
    await clearControls();
    await setControl('weekendDelivery', { saturday: true, sunday: true });
    await setControl('maxSlotsPerDay', { value: 3 });
    await w.DMBSubscription.deleteMany({});
    await w.DMBDailyOrder.deleteMany({});
    await w.DeliverySlot.updateMany({}, { $set: { deliveryFee: null } });
    await zoneFees.removeZoneFee(w.zone._id);
});

const input = async (over = {}) => ({
    subscriptionPlanId: String(w.plans.weekMF._id), vendorId: String(w.vendor._id), zoneId: String(w.zone._id),
    meals: [{ mealPlanId: String(w.meal._id), quantity: 1 }], deliverySlots: ['lunch'], startDate: await nextWeekday(1, 2), ...over
});
const second = (over = {}) => input({ vendorId: String(w.vendor2._id), meals: [{ mealPlanId: String(w.bistroMeal._id), quantity: 1 }], ...over });
const buy = async (inp) => {
    const { subscription } = await checkout.createPendingSubscription({ userId: w.user._id, input: inp, deliveryAddress: w.address });
    await subSvc.activateSubscription(subscription.subscriptionId);
    return w.DMBSubscription.findById(subscription._id);
};
const quote = (inp, extra = {}) => pricing.quoteSubscription({ ...inp, ...extra }, { userId: w.user._id });

test('fee precedence: the zone override beats the slot fee, the slot fee beats the platform fee', async () => {
    const platform = await quote(await input());
    assert.equal(platform.deliveryFeeSource, 'platform');
    assert.equal(platform.totals.delivery, 25, '5 deliveries x the platform fee of 5');

    await slotSvc.updateSlot((await w.DeliverySlot.findOne({ key: 'lunch' }))._id, { deliveryFee: 7 });
    const slot = await quote(await input());
    assert.equal(slot.deliveryFeeSource, 'slot');
    assert.deepEqual(slot.deliveryFeeBySlot, { lunch: 7 });
    assert.equal(slot.totals.delivery, 35);

    const dinner = await quote(await input({ deliverySlots: ['dinner'] }));
    assert.equal(dinner.deliveryFeeSource, 'platform', 'a slot without its own fee keeps the platform fee');
    assert.equal(dinner.totals.delivery, 25);

    await setControl('zoneDeliveryPricing', { enabled: true });
    await zoneFees.setZoneFee({ zoneId: w.zone._id, feePerOrder: 9 });
    const zone = await quote(await input());
    assert.equal(zone.deliveryFeeSource, 'zone');
    assert.equal(zone.totals.delivery, 45);
});

test('two slots in one plan each carry their own fee', async () => {
    await slotSvc.updateSlot((await w.DeliverySlot.findOne({ key: 'lunch' }))._id, { deliveryFee: 7 });
    await slotSvc.updateSlot((await w.DeliverySlot.findOne({ key: 'dinner' }))._id, { deliveryFee: 4 });
    const q = await quote(await input({ deliverySlots: ['lunch', 'dinner'] }));
    assert.equal(q.totals.delivery, 5 * 7 + 5 * 4);
});

test('slot fee validation: bad values are refused and an empty value clears it', async () => {
    const lunch = await w.DeliverySlot.findOne({ key: 'lunch' });
    await assert.rejects(slotSvc.updateSlot(lunch._id, { deliveryFee: -1 }), /between 0 and 1000/);
    await assert.rejects(slotSvc.updateSlot(lunch._id, { deliveryFee: 'abc' }), /between 0 and 1000/);
    await slotSvc.updateSlot(lunch._id, { deliveryFee: 6.5 });
    assert.equal((await w.DeliverySlot.findById(lunch._id)).deliveryFee, 6.5);
    await slotSvc.updateSlot(lunch._id, { deliveryFee: '' });
    assert.equal((await w.DeliverySlot.findById(lunch._id)).deliveryFee, null);
});

test('a second plan in the same slot and days rides on the first trip: no second delivery fee', async () => {
    const first = await quote(await input());
    assert.equal(first.totals.delivery, 25);
    await buy(await input());
    const next = await quote(await second());
    assert.equal(next.totals.delivery, 0);
    assert.equal(next.totals.deliveryVat, 0);
    assert.equal(next.deliveryFeeWaivedCount, 5);
    assert.equal(next.deliveryFeeWaived.length, 5);
    assert.ok(next.totals.food > 0, 'the meals are still charged');
});

test('only the overlapping days and slots are free: a different slot pays its own fee', async () => {
    await buy(await input({ deliverySlots: ['lunch'] }));
    const q = await quote(await second({ deliverySlots: ['lunch', 'dinner'] }));
    assert.equal(q.deliveryFeeWaivedCount, 5, 'lunch days are covered');
    assert.equal(q.totals.delivery, 25, 'the 5 dinner deliveries still pay');
});

test('seniority: the older plan keeps paying its fee on renewal; only the newer one rides free', async () => {
    const a = await buy(await input());
    const b = await buy(await second());
    const nextMonday = time.storageDateStr(new Date(a.endDate));
    const renewal = await quote(await input({ startDate: nextMonday }), { replacesSubscriptionId: String(a._id) });
    assert.equal(renewal.totals.delivery, 25, 'A renewing is still the first trip, so it pays');
    // A's renewal is bought now, after B - but it keeps A's place in line...
    const a2 = await buy(await input({ startDate: nextMonday, replacesSubscriptionId: String(a._id) }));
    assert.equal(new Date(a2.feeSeniorityAt).getTime(), new Date(a.feeSeniorityAt).getTime());
    assert.ok(new Date(a2.createdAt) > new Date(b.createdAt));
    // ...so the newer plan renewing afterwards is still covered by it and nobody pays twice
    const bRenewal = await quote(await second({ startDate: nextMonday }), { replacesSubscriptionId: String(b._id) });
    assert.equal(bRenewal.totals.delivery, 0);
    // and the older plan renewing again is not covered by the newer one
    const a3 = await quote(await input({ startDate: time.storageDateStr(new Date(a2.endDate)) }), { replacesSubscriptionId: String(a2._id) });
    assert.equal(a3.totals.delivery, 25);
});

test('company-paid office plans never cover a personal plan (different address)', async () => {
    const a = await buy(await input());
    await w.DMBSubscription.updateOne({ _id: a._id }, { $set: { source: 'office' } });
    const q = await quote(await second());
    assert.equal(q.totals.delivery, 25);
});

test('plans of someone else, other zones, cancelled or abandoned checkouts never cover', async () => {
    const a = await buy(await input());
    const other = await w.FoodUser.create({ phone: '+48555000111', name: 'Other', role: 'USER' });
    const dates = (await quote(await second())).deliveryFeeWaived;
    assert.equal(dates.length, 5);
    const covered = (userId, zoneId = w.zone._id) => bundling.coveredDeliveryKeys({ userId, zoneId, dates: dates.map((k) => k.split(':')[0]) });
    assert.equal((await covered(other._id)).size, 0, 'another customer');
    assert.equal((await covered(w.user._id, w.zone2._id)).size, 0, 'another zone');
    await w.DMBSubscription.updateOne({ _id: a._id }, { $set: { status: 'cancelled' } });
    assert.equal((await covered(w.user._id)).size, 0, 'a cancelled plan');
    await w.DMBSubscription.collection.updateOne({ _id: a._id }, { $set: { status: 'pending_payment', createdAt: new Date(Date.now() - 3 * 3_600_000), feeSeniorityAt: new Date(Date.now() - 3 * 3_600_000) } });
    assert.equal((await covered(w.user._id)).size, 0, 'an abandoned checkout');
});

test('the generated daily orders carry no fee on waived days and the slot fee on the others', async () => {
    await slotSvc.updateSlot((await w.DeliverySlot.findOne({ key: 'dinner' }))._id, { deliveryFee: 4 });
    await buy(await input({ deliverySlots: ['lunch'] }));
    const b = await buy(await second({ deliverySlots: ['lunch', 'dinner'] }));
    const day = (await w.DMBSubscription.findById(b._id).lean()).quote.deliveryFeeWaived[0].split(':')[0];
    const delivery = (slot) => ({ slot, meals: [{ mealPlanId: w.bistroMeal._id, quantity: 1 }] });
    assert.equal(pricing.priceDailyOrder(b, new Date(day), delivery('lunch')).deliveryFee, 0, 'lunch rides on the first plan');
    assert.equal(pricing.priceDailyOrder(b, new Date(day), delivery('dinner')).deliveryFee, 4, 'dinner pays the dinner fee');
});

test('single meals and pantry bags count as an existing trip', async () => {
    const { DMBOneTimeOrder } = await import('../src/modules/dailymealbox/orders/orders.models.js');
    const { PantryOrder } = await import('../src/modules/food/restaurant/models/pantryOrder.model.js');
    const day = await nextWeekday(2, 2);
    const wanted = (userId = w.user._id) => bundling.coveredDeliveryKeys({ userId, zoneId: w.zone._id, dates: [day], before: new Date(Date.now() + 1000) });
    assert.equal((await wanted()).size, 0);
    await DMBOneTimeOrder.create({
        type: 'select', userId: w.user._id, vendorId: w.vendor._id, mealPlanId: w.meal._id, deliveryDate: time.dateOnlyFromStr(day), deliverySlot: 'lunch', zoneId: w.zone._id,
        deliveryAddress: { street: 'x', city: 'Warsaw', state: 'Mazowieckie' }, status: 'paid'
    });
    assert.deepEqual([...(await wanted())], [`${day}:lunch`]);
    await PantryOrder.collection.insertOne({
        orderId: 'PO-SLOT1', userId: w.user._id, vendorId: w.vendor._id, status: 'paid', createdAt: new Date(), items: [],
        dailyDeliveries: [{ _id: new mongoose.Types.ObjectId(), date: time.dateOnlyFromStr(day), slot: 'dinner', status: 'scheduled' }]
    });
    assert.deepEqual([...(await wanted())].sort(), [`${day}:dinner`, `${day}:lunch`]);
    assert.equal((await bundling.coveredDeliveryKeys({ userId: w.user._id, zoneId: w.zone._id, dates: [day], before: new Date(Date.now() - 3_600_000) })).size, 0, 'only what was bought earlier can cover');
});
