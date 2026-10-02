/**
 * Amendment v2 Extra — subscription engine: server quote (weekly / fortnightly / monthly / annual, custom days, per-day
 * slots, max slots per day, trial, Family Box, Smart Rotation, zone delivery fee, holidays), checkout address checks,
 * schedule-driven order generation (end dates!), pause/resume, plan changes and slot retirement.
 *
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27017 node --test tests/subscriptionEngine.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { connect, disconnect, seedWorld, setControl, clearControls, nextWeekday, OUTSIDE, WARSAW } from './helpers/amendmentFixtures.mjs';

let w, pricing, checkout, gen, schedule, subSvc, slotSvc, slotMig, holidaySvc, time, zoneFees;

before(async () => {
    await connect('engine_test');
    w = await seedWorld();
    pricing = await import('../src/modules/dailymealbox/subscription/pricing.service.js');
    checkout = await import('../src/modules/dailymealbox/subscription/subscriptionCheckout.service.js');
    gen = await import('../src/modules/dailymealbox/subscription/orderGeneration.js');
    schedule = await import('../src/modules/dailymealbox/subscription/schedule.js');
    subSvc = await import('../src/modules/dailymealbox/subscription/subscription.service.js');
    slotSvc = await import('../src/modules/dailymealbox/deliverySlot/deliverySlot.service.js');
    slotMig = await import('../src/modules/dailymealbox/deliverySlot/slotMigration.service.js');
    holidaySvc = await import('../src/modules/dailymealbox/platform/holiday.service.js');
    time = await import('../src/utils/platformTime.js');
    zoneFees = await import('../src/modules/dailymealbox/platform/zoneFee.js');
    await slotSvc.listSlots(); // seeds breakfast/lunch/dinner
});

after(disconnect);

beforeEach(async () => {
    await clearControls();
    await setControl('weekendDelivery', { saturday: true, sunday: true });
    await setControl('maxSlotsPerDay', { value: 3 });
    await w.DMBSubscription.deleteMany({});
    await w.DMBDailyOrder.deleteMany({});
    const { DMBPlatformHoliday } = await import('../src/modules/dailymealbox/platform/holiday.model.js');
    await DMBPlatformHoliday.deleteMany({});
    holidaySvc.invalidateHolidayCache();
});

const baseInput = async (over = {}) => ({
    subscriptionPlanId: String(w.plans.weekMF._id),
    vendorId: String(w.vendor._id),
    zoneId: String(w.zone._id),
    meals: [{ mealPlanId: String(w.meal._id), quantity: 1 }],
    deliverySlots: ['lunch'],
    startDate: await nextWeekday(1, 2), // a Monday at least 2 days ahead
    ...over
});

test('weekly Mon–Fri quote: 5 deliveries, food + 8% VAT + 5 PLN delivery + 23% VAT', async () => {
    const q = await pricing.quoteSubscription(await baseInput(), { userId: w.user._id });
    assert.equal(q.orders, 5);
    assert.equal(q.cycle, 'weekly');
    assert.equal(q.totals.food, 100);
    assert.equal(q.totals.foodVat, 8);
    assert.equal(q.totals.delivery, 25);
    assert.equal(q.totals.deliveryVat, 5.75);
    assert.equal(q.totals.total, 138.75);
    assert.equal(q.currency, 'PLN');
    assert.equal(schedule.periodLengthDays('weekly', 'mon_fri'), 7);
    assert.equal(q.endDate, time.storageDateStr(time.addDays(new Date(q.startDate), 7)));
});

test('custom days need ACM-146; Mon/Wed/Fri prices 3 deliveries', async () => {
    const input = await baseInput({ deliveryDays: 'custom', deliveryDaysList: [1, 3, 5] });
    await assert.rejects(pricing.quoteSubscription(input, { userId: w.user._id }), /not available/);
    await setControl('customDaySelection', { enabled: true });
    const q = await pricing.quoteSubscription(input, { userId: w.user._id });
    assert.equal(q.orders, 3);
    assert.deepEqual(q.deliveryDaysList, [1, 3, 5]);
});

test('per-day slots need ACM-147 and must cover every delivery day', async () => {
    await setControl('customDaySelection', { enabled: true });
    const input = await baseInput({ deliveryDays: 'custom', deliveryDaysList: [1, 2], daySlots: { 1: ['lunch'], 2: ['dinner'] } });
    await assert.rejects(pricing.quoteSubscription(input, { userId: w.user._id }), /Different slots per day/);
    await setControl('perDaySlots', { enabled: true });
    const q = await pricing.quoteSubscription(input, { userId: w.user._id });
    assert.equal(q.orders, 2);
    assert.deepEqual(q.preview.map((p) => p.slots[0]), ['lunch', 'dinner']);
    await assert.rejects(pricing.quoteSubscription({ ...input, daySlots: { 1: ['lunch'] } }, { userId: w.user._id }), /Tuesday/);
});

test('ACM-148 max slots per day counts the customer\'s other subscriptions', async () => {
    await setControl('maxSlotsPerDay', { value: 1 });
    await assert.rejects(pricing.quoteSubscription(await baseInput({ deliverySlots: ['lunch', 'dinner'] }), { userId: w.user._id }), /only one delivery slot per day/);
    const { subscription } = await checkout.createPendingSubscription({ userId: w.user._id, input: await baseInput(), deliveryAddress: w.address });
    await subSvc.activateSubscription(subscription.subscriptionId);
    await assert.rejects(pricing.quoteSubscription(await baseInput({ deliverySlots: ['dinner'] }), { userId: w.user._id }), /only one delivery slot per day/);
    await setControl('maxSlotsPerDay', { value: 2 });
    const q = await pricing.quoteSubscription(await baseInput({ deliverySlots: ['dinner'] }), { userId: w.user._id });
    assert.equal(q.orders, 5);
});

test('annual (ACM-149) and fortnightly (ACM-151) plans', async () => {
    await assert.rejects(pricing.quoteSubscription(await baseInput({ subscriptionPlanId: String(w.plans.yearMF._id) }), { userId: w.user._id }), /Annual plans are not available/);
    await setControl('annualPlan', { enabled: true, discountPct: 20 });
    const yq = await pricing.quoteSubscription(await baseInput({ subscriptionPlanId: String(w.plans.yearMF._id) }), { userId: w.user._id });
    assert.equal(yq.cycle, 'annual');
    assert.equal(yq.orders, 260);
    assert.equal(yq.totals.food, 260 * 20 * 0.8);
    assert.ok(yq.lines.some((l) => l.key === 'annual_discount'));

    await setControl('fortnightlyPlan', { enabled: true });
    const fq = await pricing.quoteSubscription(await baseInput({ subscriptionPlanId: String(w.plans.fortMF._id) }), { userId: w.user._id });
    assert.equal(fq.deliveryPattern, 'alternate_weeks');
    assert.equal(fq.orders, 5, 'only the first of the two weeks delivers');
    assert.equal(time.storageDateStr(time.addDays(new Date(fq.startDate), 14)), fq.endDate);
});

test('trial (ACM-150) discounts only the first week, and only for new customers', async () => {
    await setControl('trialOffer', { enabled: true, discountPct: 50, minOrderAmount: 0 });
    const monthly = await baseInput({ subscriptionPlanId: String(w.plans.monthMF._id) });
    const q = await pricing.quoteSubscription(monthly, { userId: w.user._id });
    assert.equal(q.discounts.trial.applied, true);
    assert.equal(q.orders, 20);
    // First 5 deliveries at 50%: food 5*10 + 15*20 = 350.
    assert.equal(q.totals.food, 350);
    const { subscription } = await checkout.createPendingSubscription({ userId: w.user._id, input: monthly, deliveryAddress: w.address });
    await subSvc.activateSubscription(subscription.subscriptionId);
    const again = await pricing.quoteSubscription(await baseInput(), { userId: w.user._id });
    assert.equal(again.discounts.trial.applied, false, 'a returning customer gets no trial');
});

test('Family Box (ACM-172): members priced separately, one delivery fee per drop', async () => {
    const input = await baseInput({
        familyBox: { members: [
            { label: 'Person 1', meals: [{ mealPlanId: String(w.meal._id) }], slots: ['lunch'] },
            { label: 'Person 2', meals: [{ mealPlanId: String(w.meal2._id) }], slots: ['lunch'] }
        ] }
    });
    const q = await pricing.quoteSubscription(input, { userId: w.user._id });
    assert.equal(q.orders, 5);
    assert.equal(q.totals.food, 5 * (20 + 30));
    assert.equal(q.totals.delivery, 25, 'one driver visit per day');
    await setControl('familyBox', { enabled: false });
    await assert.rejects(pricing.quoteSubscription(input, { userId: w.user._id }), /Family Box is not available/);
});

test('Smart Rotation (ACM-178–181): zone-only makers, each day exactly one maker', async () => {
    const rotation = [
        { vendorId: String(w.vendor._id), mealPlanId: String(w.meal._id), days: [1, 3, 5] },
        { vendorId: String(w.vendor2._id), mealPlanId: String(w.bistroMeal._id), days: [2, 4] }
    ];
    const input = await baseInput({ subscriptionType: 'rotation', deliveryDaysList: [1, 2, 3, 4, 5], rotation });
    await assert.rejects(pricing.quoteSubscription(input, { userId: w.user._id }), /Smart Rotation is not available/);
    await setControl('smartRotation', { enabled: true });
    const q = await pricing.quoteSubscription(input, { userId: w.user._id });
    assert.equal(q.totals.food, 3 * 20 + 2 * 25);
    assert.equal(q.rotation.length, 2);
    await assert.rejects(pricing.quoteSubscription({ ...input, rotation: [rotation[0], { ...rotation[1], days: [2, 3, 4] }] }, { userId: w.user._id }), /two makers/);
    await assert.rejects(pricing.quoteSubscription({ ...input, rotation: [rotation[0], { vendorId: String(w.farVendor._id), mealPlanId: String(w.farMeal._id), days: [2, 4] }] }, { userId: w.user._id }), /does not deliver to your zone/);
    await setControl('rotationMinDaysPerMaker', { value: 3 });
    await assert.rejects(pricing.quoteSubscription(input, { userId: w.user._id }), /at least 3 day/);
});

test('zone delivery fee override (ACM-157) only while the control is on', async () => {
    await zoneFees.setZoneFee({ zoneId: w.zone._id, feePerOrder: 9 });
    let q = await pricing.quoteSubscription(await baseInput(), { userId: w.user._id });
    assert.equal(q.deliveryFeePerOrder, 5);
    await setControl('zoneDeliveryPricing', { enabled: true }, w.city._id);
    q = await pricing.quoteSubscription(await baseInput(), { userId: w.user._id });
    assert.equal(q.deliveryFeePerOrder, 9);
    assert.equal(q.deliveryFeeSource, 'zone');
});

test('a confirmed holiday is not billed', async () => {
    const start = await nextWeekday(1, 2);
    const wed = time.storageDateStr(time.addDays(new Date(start), 2));
    const h = await holidaySvc.createHoliday({ date: wed, name: 'Test holiday' });
    await holidaySvc.confirmHoliday(h._id);
    const q = await pricing.quoteSubscription(await baseInput({ startDate: start }), { userId: w.user._id });
    assert.equal(q.orders, 4);
});

test('checkout refuses addresses outside every zone and a changed price', async () => {
    const outside = { ...w.address, location: { type: 'Point', coordinates: [OUTSIDE.lng, OUTSIDE.lat] } };
    await assert.rejects(checkout.createPendingSubscription({ userId: w.user._id, input: await baseInput(), deliveryAddress: outside }), /outside our delivery area/);
    await assert.rejects(checkout.createPendingSubscription({ userId: w.user._id, input: await baseInput(), deliveryAddress: w.address, expectedTotal: 1 }), (err) => err.code === 'PRICE_CHANGED');
    const { subscription, quote } = await checkout.createPendingSubscription({ userId: w.user._id, input: await baseInput(), deliveryAddress: w.address, expectedTotal: 138.75 });
    assert.equal(subscription.status, 'pending_payment');
    assert.equal(subscription.pricing.totalPrice, quote.totals.total);
    assert.equal(String(subscription.deliveryAddress.zoneId), String(w.zone._id));
});

test('orders are generated from the schedule and never past the end date', async () => {
    const start = await nextWeekday(1, 1);
    const { subscription } = await checkout.createPendingSubscription({ userId: w.user._id, input: await baseInput({ startDate: start }), deliveryAddress: w.address });
    await subSvc.activateSubscription(subscription.subscriptionId);
    const sub = await w.DMBSubscription.findById(subscription._id).lean();
    for (let i = 0; i < 14; i++) await gen.generateForDate(time.addDays(new Date(start), i));
    const orders = await w.DMBDailyOrder.find({ subscriptionId: sub._id }).sort({ deliveryDate: 1 }).lean();
    assert.equal(orders.length, 5);
    assert.ok(orders.every((o) => o.deliveryDate < sub.endDate));
    assert.equal(orders[0].pricing.foodCost, 20);
    assert.equal(orders[0].pricing.totalPrice, 27.75);
});

test('pause removes the paused deliveries and moves the end date by as many delivery days', async () => {
    const { subscription } = await checkout.createPendingSubscription({ userId: w.user._id, input: await baseInput({ startDate: time.storageDateStr(time.addDays(time.localToday(), 1)), deliveryDays: undefined, subscriptionPlanId: String(w.plans.weekFull._id) }), deliveryAddress: w.address });
    await subSvc.activateSubscription(subscription.subscriptionId);
    const before = await w.DMBSubscription.findById(subscription._id).lean();
    await gen.generateForUser(w.user._id, { days: 7 });
    const res = await subSvc.pauseSubscription({ subscriptionId: subscription.subscriptionId, userId: w.user._id, pauseDays: 2 });
    assert.equal(res.movedDeliveries, 2);
    const after = await w.DMBSubscription.findById(subscription._id).lean();
    assert.equal(time.storageDateStr(after.endDate), time.storageDateStr(time.addDays(before.endDate, 2)));
    const resumed = await subSvc.resumeSubscription(subscription.subscriptionId, { userId: w.user._id });
    assert.equal(resumed.status, 'active');
    assert.equal(time.storageDateStr(resumed.endDate), time.storageDateStr(before.endDate), 'early resume gives the days back');
});

test('downgrade monthly → weekly: starts next Monday, unused value goes to the wallet', async () => {
    const start = time.storageDateStr(time.addDays(time.localToday(), 1));
    const { subscription } = await checkout.createPendingSubscription({ userId: w.user._id, input: await baseInput({ subscriptionPlanId: String(w.plans.monthMF._id), startDate: start }), deliveryAddress: w.address });
    await subSvc.activateSubscription(subscription.subscriptionId);
    const preview = await checkout.previewChange({ userId: w.user._id, subscriptionId: subscription.subscriptionId, type: 'change_plan', input: { subscriptionPlanId: String(w.plans.weekMF._id) } });
    assert.equal(preview.changeType, 'downgrade');
    assert.equal(new Date(preview.effectiveDate).getUTCDay(), 1);
    assert.ok(preview.credit.amount > 0);
    const { subscription: next } = await checkout.createChangeSubscription({ userId: w.user._id, subscriptionId: subscription.subscriptionId, type: 'change_plan', input: { subscriptionPlanId: String(w.plans.weekMF._id) } });
    await subSvc.activateSubscription(next.subscriptionId);
    const old = await w.DMBSubscription.findById(subscription._id).lean();
    assert.equal(time.storageDateStr(old.endDate), preview.effectiveDate);
    assert.equal(String(old.replacedBySubscriptionId), String(next._id));
    const { getUserWallet } = await import('../src/modules/food/user/services/userWallet.service.js');
    const wallet = await getUserWallet(w.user._id);
    assert.ok((wallet.wallet?.balance ?? wallet.balance) >= preview.credit.amount);
});

test('upgrade weekly → monthly takes effect at the next billing cycle', async () => {
    const { subscription } = await checkout.createPendingSubscription({ userId: w.user._id, input: await baseInput(), deliveryAddress: w.address });
    await subSvc.activateSubscription(subscription.subscriptionId);
    const sub = await w.DMBSubscription.findById(subscription._id).lean();
    const preview = await checkout.previewChange({ userId: w.user._id, subscriptionId: subscription.subscriptionId, type: 'change_plan', input: { subscriptionPlanId: String(w.plans.monthMF._id) } });
    assert.equal(preview.changeType, 'upgrade');
    assert.equal(preview.effectiveDate, time.storageDateStr(sub.endDate));
    assert.equal(preview.credit.amount, 0);
});

test('retiring a slot: draft → active needs drivers; deactivation flags and later migrates subscribers', async () => {
    const created = await slotSvc.createSlot({ name: 'Late Dinner', startTime: '20:00', endTime: '22:00' });
    assert.equal(created.status, 'draft');
    await assert.rejects(slotSvc.activateSlot(created._id), /No approved driver/);
    await w.FoodDeliveryPartner.create({ name: 'Jan', phone: '+48500000001', status: 'approved', allowedShifts: ['late_dinner'] });
    const { slot } = await slotSvc.activateSlot(created._id);
    assert.equal(slot.status, 'active');

    const { subscription } = await checkout.createPendingSubscription({ userId: w.user._id, input: await baseInput({ deliverySlots: ['late_dinner'] }), deliveryAddress: w.address });
    await subSvc.activateSubscription(subscription.subscriptionId);
    const res = await slotSvc.deactivateSlot(created._id, { graceDays: 14, fallbackSlotKey: 'dinner' });
    assert.equal(res.slot.status, 'deactivating');
    assert.equal(res.affected, 1);
    let sub = await w.DMBSubscription.findById(subscription._id).lean();
    assert.equal(sub.needsSlotChange, true);
    await slotMig.migrateExpiredSlots(new Date(Date.now() + 15 * 86_400_000));
    sub = await w.DMBSubscription.findById(subscription._id).lean();
    assert.deepEqual(sub.deliverySlots, ['dinner']);
    assert.equal(sub.needsSlotChange, false);
    const retired = await w.DeliverySlot.findById(created._id).lean();
    assert.equal(retired.status, 'disabled');
});

test('Polish holidays: 14 dates for 2027 incl. Easter Monday and Christmas Eve, imported as pending', async () => {
    const list = holidaySvc.polishPublicHolidays(2027);
    assert.equal(list.length, 14);
    assert.ok(list.some((h) => h.date === '2027-03-29' && /Easter Monday/.test(h.name)));
    assert.ok(list.some((h) => h.date === '2027-12-24'));
    const res = await holidaySvc.importPolishHolidays(2027);
    assert.equal(res.created, 14);
    const again = await holidaySvc.importPolishHolidays(2027);
    assert.equal(again.created, 0);
});

test('confirming a holiday extends live subscriptions by one delivery day', async () => {
    const start = await nextWeekday(1, 2);
    const { subscription } = await checkout.createPendingSubscription({ userId: w.user._id, input: await baseInput({ startDate: start }), deliveryAddress: w.address });
    await subSvc.activateSubscription(subscription.subscriptionId);
    const before = await w.DMBSubscription.findById(subscription._id).lean();
    const wed = time.storageDateStr(time.addDays(new Date(start), 2));
    const h = await holidaySvc.createHoliday({ date: wed, name: 'Closure' });
    const confirmed = await holidaySvc.confirmHoliday(h._id);
    assert.equal(confirmed.affectedSubscriptions, 1);
    const after = await w.DMBSubscription.findById(subscription._id).lean();
    // Old end = next Monday; one extra delivery day → Tuesday after.
    assert.equal(time.storageDateStr(after.endDate), time.storageDateStr(time.addDays(before.endDate, 1)));
});
