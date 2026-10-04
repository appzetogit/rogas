/**
 * One-off cleanup: the vendor app used to save invented nutrition (300 kcal / 15 g protein / 25 g carbs / 10 g fat) for
 * meals where the vendor entered nothing. This marks exactly that combination as "not provided".
 *
 *   node scripts/clear_default_nutrition.mjs          # dry run: only counts
 *   node scripts/clear_default_nutrition.mjs --apply  # performs the update
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DMBMealPlan } from '../src/modules/dailymealbox/mealplan/mealPlan.model.js';

dotenv.config();

const apply = process.argv.includes('--apply');
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

await mongoose.connect(uri);
const filter = {
    'nutrition.calories': 300,
    'nutrition.protein': 15,
    'nutrition.carbs': 25,
    'nutrition.fats': 10
};
const count = await DMBMealPlan.countDocuments(filter);
console.log(`${count} meal plan(s) carry the invented default nutrition.`);
if (apply && count > 0) {
    const res = await DMBMealPlan.updateMany(filter, {
        $set: { 'nutrition.calories': null, 'nutrition.protein': null, 'nutrition.carbs': null, 'nutrition.fats': null, 'nutrition.isProvided': false }
    });
    console.log(`Updated ${res.modifiedCount}.`);
} else if (!apply) {
    console.log('Dry run - add --apply to update.');
}
await mongoose.disconnect();
