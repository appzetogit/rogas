/**
 * One-off: subscription plans used to be created by admin and shared by every vendor. Vendors now own their plans, so this
 * copies each active platform plan (vendorId = null) into every approved vendor's own plans. The vendor can then edit or
 * delete the copies. The platform plans themselves stay as they are (they hold the VAT / fee terms for rotations, office
 * orders and one-off meals, and existing subscriptions point to them). Safe to run more than once: a copy is made once per
 * vendor and plan.
 *
 *   node scripts/migrate_plans_to_vendors.mjs          # dry run: only counts
 *   node scripts/migrate_plans_to_vendors.mjs --apply  # creates the copies
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { VendorSubscriptionPlan } from '../src/modules/dailymealbox/subscription/vendorSubscriptionPlan.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';

dotenv.config();
const apply = process.argv.includes('--apply');

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const templates = await VendorSubscriptionPlan.find({ vendorId: null, status: 'active' }).lean();
const vendors = await FoodRestaurant.find({ status: 'approved' }).select('restaurantName').lean();
console.log(`${templates.length} platform plan(s), ${vendors.length} approved vendor(s).`);

let created = 0;
for (const v of vendors) {
    const have = new Set((await VendorSubscriptionPlan.find({ vendorId: v._id, copiedFromId: { $ne: null } }).select('copiedFromId').lean()).map((p) => String(p.copiedFromId)));
    for (const t of templates) {
        if (have.has(String(t._id))) continue;
        created++;
        console.log(`- ${v.restaurantName}: ${t.name} (${t.duration}, ${t.deliveryDays})`);
        if (apply) {
            await VendorSubscriptionPlan.create({
                vendorId: v._id, copiedFromId: t._id, name: t.name, duration: t.duration, deliveryDays: t.deliveryDays, daysCount: t.daysCount,
                description: t.description, features: t.features, foodVat: t.foodVat, deliveryVat: t.deliveryVat, platformFee: t.platformFee,
                applyFoodVatOnMenu: t.applyFoodVatOnMenu, discountPercent: 0, status: 'active'
            });
        }
    }
}
console.log(apply ? `Created ${created} copies.` : `${created} copies would be created. Run with --apply.`);
await mongoose.disconnect();
