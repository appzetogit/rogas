/**
 * Read-only audit: lists approved vendors whose saved pin is missing or outside their service zone.
 * Such vendors are hidden from customers (their distance / driver matching would be wrong) until they re-pin the kitchen
 * in Profile > Location & Zone. Nothing is changed.
 *
 *   node scripts/check_vendor_locations.mjs
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { vendorLocationProblem, vendorPoint } from '../src/modules/dailymealbox/zones/zoneGeo.service.js';

dotenv.config();

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const vendors = await FoodRestaurant.find({ status: 'approved' }).select('restaurantName zoneId zoneName location city').lean();
let bad = 0;
for (const v of vendors) {
    const p = vendorPoint(v);
    const problem = await vendorLocationProblem({ lat: p?.lat ?? null, lng: p?.lng ?? null, zoneId: v.zoneId });
    if (problem) {
        bad++;
        console.log(`- ${v.restaurantName} (${v._id}) zone="${v.zoneName || v.zoneId || '-'}" pin=${p ? `${p.lat},${p.lng}` : 'none'} -> ${problem.code}: ${problem.message}`);
    }
}
console.log(`\n${bad} of ${vendors.length} approved vendor(s) have a pin that is missing or outside their zone.`);
await mongoose.disconnect();
