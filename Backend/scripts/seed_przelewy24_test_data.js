/**
 * One-off seed for manually testing the Przelewy24 (Poland) payment flow end-to-end in the real app.
 *
 * Creates (only if they don't already exist — safe to run more than once):
 *   - a Poland delivery zone
 *   - one approved vendor in it
 *   - one active meal plan for that vendor (this is the price the customer actually pays — see the
 *     "plan pricing" fix: Backend/src/modules/dailymealbox/subscription/vendorSubscriptionPlan.model.js)
 *   - one active subscription-duration plan (Weekly, Mon-Fri), only if no active one exists yet
 *
 * Everything is named with a "TEST" prefix so it's obvious in the admin panel and easy to remove again
 * (see the companion `unseed_przelewy24_test_data.js`).
 *
 *   node scripts/seed_przelewy24_test_data.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) throw new Error('MONGO_URI is not set in Backend/.env');

const TEST_ZONE_NAME = 'TEST Poland (Przelewy24)';
const TEST_VENDOR_NAME = 'TEST Przelewy24 Vendor';
const TEST_PLAN_NAME = 'TEST Weekly Lunch Box';
const TEST_SUB_PLAN_NAME = 'TEST Weekly (Mon-Fri)';
const PRICE_PER_DAY = 25; // PLN, set by "the vendor" — this is what actually gets charged

async function run() {
    await mongoose.connect(uri);
    console.log(`Connected to ${mongoose.connection.name}\n`);

    const { FoodZone } = await import('../src/modules/food/admin/models/zone.model.js');
    const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');
    const { DMBMealPlan } = await import('../src/modules/dailymealbox/mealplan/mealPlan.model.js');
    const { VendorSubscriptionPlan } = await import('../src/modules/dailymealbox/subscription/vendorSubscriptionPlan.model.js');

    // ── Zone (a small polygon around central Warsaw) ─────────────────────────
    let zone = await FoodZone.findOne({ name: TEST_ZONE_NAME });
    if (!zone) {
        zone = await FoodZone.create({
            name: TEST_ZONE_NAME,
            zoneName: TEST_ZONE_NAME,
            country: 'Poland',
            serviceLocation: 'Warsaw',
            unit: 'kilometer',
            isActive: true,
            coordinates: [
                { latitude: 52.28, longitude: 20.90 },
                { latitude: 52.28, longitude: 21.10 },
                { latitude: 52.15, longitude: 21.10 },
                { latitude: 52.15, longitude: 20.90 }
            ]
        });
        console.log(`✓ created zone   ${zone._id}  "${zone.name}"`);
    } else {
        console.log(`= zone already exists   ${zone._id}  "${zone.name}"`);
    }

    // ── Vendor ─────────────────────────────────────────────────────────────
    let vendor = await FoodRestaurant.findOne({ restaurantName: TEST_VENDOR_NAME });
    if (!vendor) {
        vendor = await FoodRestaurant.create({
            restaurantName: TEST_VENDOR_NAME,
            ownerName: 'Test Owner',
            ownerEmail: 'test-przelewy24-vendor@example.invalid',
            pureVegRestaurant: false,
            status: 'approved',
            isAcceptingOrders: true,
            vendorType: 'restaurant',
            city: 'Warsaw',
            zoneId: zone._id,
            zoneName: zone.name,
            mealSlots: ['lunch', 'dinner'],
            cuisines: ['Polish', 'Home-style']
        });
        console.log(`✓ created vendor ${vendor._id}  "${vendor.restaurantName}"`);
    } else {
        console.log(`= vendor already exists ${vendor._id}  "${vendor.restaurantName}"`);
        // make sure it's still usable even if it was left in a bad state by an earlier run
        if (vendor.status !== 'approved' || String(vendor.zoneId) !== String(zone._id)) {
            vendor.status = 'approved';
            vendor.zoneId = zone._id;
            vendor.zoneName = zone.name;
            await vendor.save();
            console.log('  (re-approved / re-linked to the test zone)');
        }
    }

    // ── Meal plan (the vendor's own price — this is what the customer is actually charged) ──────────
    let mealPlan = await DMBMealPlan.findOne({ vendorId: vendor._id, name: TEST_PLAN_NAME });
    if (!mealPlan) {
        mealPlan = await DMBMealPlan.create({
            vendorId: vendor._id,
            name: TEST_PLAN_NAME,
            description: 'Seeded for manual Przelewy24 testing.',
            pricePerDay: PRICE_PER_DAY,
            currency: 'PLN',
            city: 'Warsaw',
            zoneIds: [zone._id],
            availableSlots: ['lunch'],
            availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
            status: 'active'
        });
        console.log(`✓ created meal plan ${mealPlan._id}  "${mealPlan.name}"  ${PRICE_PER_DAY} PLN/day`);
    } else {
        if (mealPlan.status !== 'active' || mealPlan.pricePerDay !== PRICE_PER_DAY) {
            mealPlan.status = 'active';
            mealPlan.pricePerDay = PRICE_PER_DAY;
            await mealPlan.save();
        }
        console.log(`= meal plan already exists ${mealPlan._id}  "${mealPlan.name}"  ${mealPlan.pricePerDay} PLN/day`);
    }

    // ── Subscription duration plan (admin policy: duration + VAT/fee — only made if none is active) ──
    const activeSubPlans = await VendorSubscriptionPlan.find({ status: 'active' }).lean();
    let subPlan = activeSubPlans[0];
    if (!subPlan) {
        subPlan = await VendorSubscriptionPlan.create({
            name: TEST_SUB_PLAN_NAME,
            duration: 'week',
            deliveryDays: 'mon_fri',
            description: 'Seeded for manual Przelewy24 testing.',
            foodVat: 8,
            deliveryVat: 0,
            platformFee: 0,
            status: 'active'
        });
        console.log(`✓ created subscription plan ${subPlan._id}  "${subPlan.name}" (week, Mon-Fri, 8% food VAT)`);
    } else {
        console.log(`= using existing active subscription plan ${subPlan._id}  "${subPlan.name}" (${subPlan.duration}, ${subPlan.deliveryDays})`);
    }

    await mongoose.disconnect();

    const days = subPlan.duration === 'day' ? 1 : subPlan.duration === 'week' ? (subPlan.deliveryDays === 'mon_fri' ? 5 : 7) : (subPlan.deliveryDays === 'mon_fri' ? 20 : 30);
    const foodTotal = PRICE_PER_DAY * 1 * days;
    const foodVatAmount = Math.round(foodTotal * (Number(subPlan.foodVat) || 0)) / 100;

    console.log(`
Ready to test:
  1. Open the customer app and go to the Plans tab.
  2. Search for "${TEST_VENDOR_NAME}".
  3. Open it, pick "${TEST_PLAN_NAME}" and the "${subPlan.name}" subscription plan.
  4. Pick zone "${TEST_ZONE_NAME}" if you're asked to choose a delivery zone.
  5. Continue to Checkout — the payment picker should default to Przelewy24 / BLIK (Poland -> PLN).
  6. Pay — you should land on the Przelewy24 sandbox page (or your live P24 account if you're not
     in sandbox mode). Expect a food total of ~${foodTotal} PLN + ${subPlan.foodVat}% food VAT
     (~${foodVatAmount} PLN) + any configured delivery fee — the exact number is shown on the price
     summary screen before you pay.

Cleanup when you're done: node scripts/unseed_przelewy24_test_data.js
`);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
