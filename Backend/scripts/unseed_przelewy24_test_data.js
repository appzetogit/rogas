/**
 * Removes exactly what seed_przelewy24_test_data.js created (matched by the same "TEST ..." names).
 * Never touches the subscription plan if it wasn't the one this seed created (it's shared platform policy
 * and may have been reused by real data since).
 *
 *   node scripts/unseed_przelewy24_test_data.js
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

async function run() {
    await mongoose.connect(uri);
    console.log(`Connected to ${mongoose.connection.name}\n`);

    const { FoodZone } = await import('../src/modules/food/admin/models/zone.model.js');
    const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');
    const { DMBMealPlan } = await import('../src/modules/dailymealbox/mealplan/mealPlan.model.js');
    const { VendorSubscriptionPlan } = await import('../src/modules/dailymealbox/subscription/vendorSubscriptionPlan.model.js');

    const vendor = await FoodRestaurant.findOne({ restaurantName: TEST_VENDOR_NAME });
    if (vendor) {
        const { deletedCount } = await DMBMealPlan.deleteMany({ vendorId: vendor._id, name: TEST_PLAN_NAME });
        console.log(`deleted ${deletedCount} meal plan(s)`);
        await FoodRestaurant.deleteOne({ _id: vendor._id });
        console.log(`deleted vendor "${vendor.restaurantName}"`);
    } else {
        console.log('no test vendor found');
    }

    const zoneResult = await FoodZone.deleteOne({ name: TEST_ZONE_NAME });
    console.log(`deleted ${zoneResult.deletedCount} zone(s)`);

    const subPlanResult = await VendorSubscriptionPlan.deleteOne({ name: TEST_SUB_PLAN_NAME });
    console.log(`deleted ${subPlanResult.deletedCount} subscription plan(s) (only the one this seed created, if any)`);

    await mongoose.disconnect();
    console.log('\nDone.');
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
