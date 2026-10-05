/**
 * Vendor-owned subscription plans: a vendor creates, edits and deletes only their own plans; a plan can only be bought
 * from its own maker; the vendor's plan discount lowers the food price; VAT / fee come from the platform, not the vendor.
 * Needs a LOCAL MongoDB:   node --test tests/vendorPlans.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { connect, disconnect, seedWorld, setControl, clearControls, nextWeekday } from './helpers/amendmentFixtures.mjs';

let w, pricing, plansSvc, slotSvc;

before(async () => {
    await connect('vendor_plans_test');
    w = await seedWorld();
    pricing = await import('../src/modules/dailymealbox/subscription/pricing.service.js');
    plansSvc = await import('../src/modules/dailymealbox/subscription/vendorPlans.service.js');
    slotSvc = await import('../src/modules/dailymealbox/deliverySlot/deliverySlot.service.js');
    await slotSvc.listSlots();
});
after(disconnect);
beforeEach(async () => {
    await clearControls();
    await setControl('weekendDelivery', { saturday: true, sunday: true });
    await w.DMBSubscription.deleteMany({});
});

const input = async (planId, over = {}) => ({
    subscriptionPlanId: String(planId),
    vendorId: String(w.vendor._id),
    zoneId: String(w.zone._id),
    meals: [{ mealPlanId: String(w.meal._id), quantity: 1 }],
    deliverySlots: ['lunch'],
    startDate: await nextWeekday(1, 2),
    ...over
});

test('a vendor creates a plan: VAT and fee come from the platform plan of the same duration', async () => {
    const plan = await plansSvc.createVendorPlan(w.vendor._id, { name: 'My weekly', duration: 'week', deliveryDays: 'mon_fri', discountPercent: 10, foodVat: 99, platformFee: 500 });
    assert.equal(String(plan.vendorId), String(w.vendor._id));
    assert.equal(plan.daysCount, 5);
    assert.equal(plan.discountPercent, 10);
    // the vendor cannot type VAT or the platform fee: they are the platform's (seed plans: 8 % / 23 % / 0)
    assert.equal(plan.foodVat, 8);
    assert.equal(plan.deliveryVat, 23);
    assert.equal(plan.platformFee, 0);
});

test('validation: name, duration and discount range', async () => {
    await assert.rejects(plansSvc.createVendorPlan(w.vendor._id, { name: '', duration: 'week' }), /name is required/);
    await assert.rejects(plansSvc.createVendorPlan(w.vendor._id, { name: 'x', duration: 'year' }), /Duration must be/);
    await assert.rejects(plansSvc.createVendorPlan(w.vendor._id, { name: 'x', duration: 'week', discountPercent: 80 }), /between 0 and 50/);
});

test('a vendor can only see and change their own plans', async () => {
    const mine = await plansSvc.createVendorPlan(w.vendor._id, { name: 'Mine', duration: 'week' });
    const theirs = await plansSvc.createVendorPlan(w.vendor2._id, { name: 'Theirs', duration: 'week' });
    const list = await plansSvc.listVendorPlans(w.vendor._id);
    assert.ok(list.some((p) => String(p._id) === String(mine._id)));
    assert.ok(!list.some((p) => String(p._id) === String(theirs._id)));
    await assert.rejects(plansSvc.updateVendorPlan(w.vendor._id, theirs._id, { name: 'Hacked' }), /Plan not found/);
    await assert.rejects(plansSvc.deleteVendorPlan(w.vendor._id, theirs._id), /Plan not found/);
});

test('a plan can only be bought from its own maker', async () => {
    const plan = await plansSvc.createVendorPlan(w.vendor2._id, { name: 'Bistro weekly', duration: 'week', deliveryDays: 'mon_fri' });
    await assert.rejects(pricing.quoteSubscription(await input(plan._id), { userId: w.user._id }), /belongs to another maker/);
});

test('the plan discount lowers the food price and is shown as its own line', async () => {
    const plan = await plansSvc.createVendorPlan(w.vendor._id, { name: 'Weekly -10', duration: 'week', deliveryDays: 'mon_fri', discountPercent: 10 });
    const base = await pricing.quoteSubscription(await input(w.plans.weekMF._id), { userId: w.user._id });
    const q = await pricing.quoteSubscription(await input(plan._id), { userId: w.user._id });
    assert.equal(q.discounts.planPct, 10);
    assert.ok(q.lines.some((l) => l.key === 'plan_discount' && l.amount < 0));
    assert.ok(q.totals.food < base.totals.food, 'food net is lower');
    assert.ok(Math.abs(q.totals.food - base.totals.food * 0.9) < 0.02, `food ${q.totals.food} vs ${base.totals.food * 0.9}`);
    assert.ok(q.totals.total < base.totals.total);
});

test('old platform plans (no vendor) still work for every maker', async () => {
    const q = await pricing.quoteSubscription(await input(w.plans.weekMF._id), { userId: w.user._id });
    assert.ok(q.totals.total > 0);
});

test('duration cannot change while customers are subscribed; a used plan is switched off, not deleted', async () => {
    const plan = await plansSvc.createVendorPlan(w.vendor._id, { name: 'Used', duration: 'week', deliveryDays: 'mon_fri' });
    await w.DMBSubscription.create({
        userId: w.user._id, vendorId: w.vendor._id, zoneId: w.zone._id, subscriptionPlanId: plan._id, status: 'active',
        duration: 'weekly', billingCycle: 'weekly', startDate: new Date(), endDate: new Date(Date.now() + 7 * 864e5), deliveryDays: 'mon_fri',
        deliverySlots: ['lunch'], deliverySlot: 'lunch', pricing: { basePricePerDay: 20, deliveryFeePerDay: 5, foodVat: 8, deliveryVat: 23, totalPrice: 100, totalPerWeek: 100, currency: 'PLN' },
        deliveryAddress: w.address
    });
    await assert.rejects(plansSvc.updateVendorPlan(w.vendor._id, plan._id, { duration: 'month' }), /cannot change/);
    const renamed = await plansSvc.updateVendorPlan(w.vendor._id, plan._id, { name: 'Used (renamed)', discountPercent: 5 });
    assert.equal(renamed.name, 'Used (renamed)');
    assert.deepEqual(await plansSvc.deleteVendorPlan(w.vendor._id, plan._id), { archived: true });
    const unused = await plansSvc.createVendorPlan(w.vendor._id, { name: 'Unused', duration: 'day' });
    assert.deepEqual(await plansSvc.deleteVendorPlan(w.vendor._id, unused._id), { archived: false });
});

test('a newly approved vendor gets the platform plans as a starting point (once)', async () => {
    const fresh = await w.FoodRestaurant.create({ restaurantName: 'Fresh Kitchen', ownerName: 'Ewa', ownerPhone: `+48${Math.floor(600000000 + Math.random() * 99999999)}`, status: 'approved', zoneId: w.zone._id });
    const n = await plansSvc.giveStarterPlans(fresh._id);
    assert.ok(n >= 6, `copied ${n}`);
    assert.equal(await plansSvc.giveStarterPlans(fresh._id), 0, 'second call changes nothing');
    const list = await plansSvc.listVendorPlans(fresh._id);
    assert.ok(list.every((p) => String(p.vendorId) === String(fresh._id) && p.copiedFromId));
});

test('admin platform-fee control overrides the fee of every plan; off = the plan keeps its own', async () => {
    const plan = await plansSvc.createVendorPlan(w.vendor._id, { name: 'Fee plan', duration: 'week', deliveryDays: 'mon_fri' });
    await w.VendorSubscriptionPlan.updateOne({ _id: plan._id }, { $set: { platformFee: 4 } });
    const q0 = await pricing.quoteSubscription(await input(plan._id), { userId: w.user._id });
    assert.equal(q0.totals.platformFee, 4);
    await setControl('subscriptionPlatformFee', { enabled: true, amount: 7.5 });
    const q1 = await pricing.quoteSubscription(await input(plan._id), { userId: w.user._id });
    assert.equal(q1.totals.platformFee, 7.5);
    assert.ok(q1.lines.some((l) => l.key === 'platform_fee' && l.amount === 7.5));
});
