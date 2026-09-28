/**
 * Regression tests: subscription and office-plan prices must come from the vendor's own DMBMealPlan.pricePerDay,
 * never from the admin's VendorSubscriptionPlan.price (that field is a leftover of a fixed bug — see
 * src/modules/dailymealbox/subscription/vendorSubscriptionPlan.model.js — and is no longer read anywhere).
 *
 * Needs a LOCAL MongoDB (default mongodb://127.0.0.1:27017). It creates a throw-away database and drops it
 * afterwards, and refuses to run against anything that is not localhost.
 *
 *   PLAN_PRICING_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/planPricing.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const BASE_URI = process.env.PLAN_PRICING_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE_URI)) {
    throw new Error(`Refusing to run: PLAN_PRICING_TEST_MONGO_URI must be a plain local mongod (got ${BASE_URI.replace(/\/\/.*@/, '//***@')})`);
}
const DB_NAME = `plan_pricing_test_${Date.now()}`;

let VendorSubscriptionPlan, DMBMealPlan, assertPriceFloor, officeAssignmentPlanFloor, daysForSubscriptionPlan;

before(async () => {
    await mongoose.connect(`${BASE_URI.replace(/\/$/, '')}/${DB_NAME}`);
    ({ VendorSubscriptionPlan } = await import('../src/modules/dailymealbox/subscription/vendorSubscriptionPlan.model.js'));
    ({ DMBMealPlan } = await import('../src/modules/dailymealbox/mealplan/mealPlan.model.js'));
    ({ assertPriceFloor } = await import('../src/modules/dailymealbox/payment/dmb.payment.routes.js'));
    ({ officeAssignmentPlanFloor, daysForSubscriptionPlan } = await import('../src/modules/dailymealbox/office/controllers/office.controller.js'));
});

after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});

const makeMealPlan = (pricePerDay, over = {}) =>
    DMBMealPlan.create({ vendorId: new mongoose.Types.ObjectId(), name: 'Test Meal', pricePerDay, city: 'Warsaw', ...over });

const makeSubPlan = (over = {}) =>
    VendorSubscriptionPlan.create({ name: 'Weekly', duration: 'week', deliveryDays: 'mon_fri', platformFee: 0, status: 'active', ...over });

test('subscription checkout: the price floor is the vendor meal price × days × slots, not the admin plan price', async () => {
    const meal = await makeMealPlan(10); // 10 PLN/day, set by the vendor
    const plan = await makeSubPlan({ price: 999 }); // an admin "price" left on the doc — must be ignored
    const days = 5; // week, mon_fri

    // Exactly the vendor-priced floor: accepted.
    await assertPriceFloor({ subscriptionPlanId: plan._id, slots: 1, meals: [{ mealPlanId: meal._id, quantity: 1 }], pricing: { totalPrice: 10 * days } });

    // One cent under the vendor-priced floor: refused.
    await assert.rejects(
        () => assertPriceFloor({ subscriptionPlanId: plan._id, slots: 1, meals: [{ mealPlanId: meal._id, quantity: 1 }], pricing: { totalPrice: 10 * days - 1 } }),
        /price has changed/
    );

    // A total that would only have cleared the OLD admin-price floor (999) is irrelevant now: a much higher total
    // than the real vendor floor must still be accepted purely because it clears the vendor floor, proving `price`
    // plays no part any more (it would only be a coincidence, not a requirement, if it did).
    await assertPriceFloor({ subscriptionPlanId: plan._id, slots: 1, meals: [{ mealPlanId: meal._id, quantity: 1 }], pricing: { totalPrice: 1000 } });
});

test('subscription checkout: several meals and slots multiply the floor correctly', async () => {
    const mealA = await makeMealPlan(10);
    const mealB = await makeMealPlan(6);
    const plan = await makeSubPlan({ duration: 'day' }); // 1 day
    const floor = (10 * 2 + 6 * 1) * 1 * 3; // (10*qty2 + 6*qty1) per day × 1 day × 3 slots
    await assertPriceFloor({
        subscriptionPlanId: plan._id,
        slots: 3,
        meals: [{ mealPlanId: mealA._id, quantity: 2 }, { mealPlanId: mealB._id, quantity: 1 }],
        pricing: { totalPrice: floor }
    });
    await assert.rejects(
        () => assertPriceFloor({ subscriptionPlanId: plan._id, slots: 3, meals: [{ mealPlanId: mealA._id, quantity: 2 }, { mealPlanId: mealB._id, quantity: 1 }], pricing: { totalPrice: floor - 1 } }),
        /price has changed/
    );
});

test('subscription checkout: a meal with no price contributes nothing (never falls back to the admin price)', async () => {
    const meal = await makeMealPlan(0);
    const plan = await makeSubPlan({ price: 500 });
    await assertPriceFloor({ subscriptionPlanId: plan._id, slots: 1, meals: [{ mealPlanId: meal._id, quantity: 1 }], pricing: { totalPrice: 0.01 } });
});

test('office assignment: the floor is the vendor meal price × plan days × employee count', () => {
    const mealPlan = { pricePerDay: 12 };
    const weekly = { duration: 'week', deliveryDays: 'mon_fri' }; // 5 days
    assert.equal(daysForSubscriptionPlan(weekly), 5);
    assert.equal(officeAssignmentPlanFloor({ subPlan: weekly, mealPlan, employeeCount: 4 }), 12 * 5 * 4);

    const monthlyFullWeek = { duration: 'month', deliveryDays: 'full_week' }; // 30 days
    assert.equal(daysForSubscriptionPlan(monthlyFullWeek), 30);
    assert.equal(officeAssignmentPlanFloor({ subPlan: monthlyFullWeek, mealPlan, employeeCount: 10 }), 12 * 30 * 10);
});

test('office assignment: the admin plan price (if still present on old records) is never read', () => {
    const mealPlan = { pricePerDay: 20 };
    const subPlan = { duration: 'day', deliveryDays: 'full_week', price: 99999 }; // a huge leftover admin price
    // Only the vendor's 20/day, once, counts — the huge admin price has no effect.
    assert.equal(officeAssignmentPlanFloor({ subPlan, mealPlan, employeeCount: 1 }), 20);
});
