import mongoose from 'mongoose';
import { DMBDailyMenu } from '../src/modules/dailymealbox/mealplan/dailyMenu.model.js';
import { DMBDailyOrder } from '../src/modules/dailymealbox/subscription/dmb.dailyOrder.model.js';

import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
    console.log("Connecting to MongoDB at " + MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log("Connected.");

    const menus = await DMBDailyMenu.find({}).lean();
    console.log("\n--- DMBDailyMenu Records ---");
    for (const m of menus) {
        console.log(`ID: ${m._id}, Date: ${m.date.toISOString().split('T')[0]}, Plan: ${m.mealPlanId}, Dish: ${m.dishName}, Photo: ${m.photo}`);
    }

    const plans = await mongoose.model('DMBMealPlan', new mongoose.Schema({}, { strict: false, collection: 'dmb_meal_plans' })).find({}).lean();
    console.log("\n--- DMBMealPlan Records ---");
    for (const p of plans) {
        console.log(`ID: ${p._id}, Name: ${p.name}, Photos: ${JSON.stringify(p.photos)}`);
    }

    const orders = await DMBDailyOrder.find({}).lean();
    console.log("\n--- DMBDailyOrder Records ---");
    for (const o of orders) {
        console.log(`ID: ${o._id}, Date: ${o.deliveryDate.toISOString().split('T')[0]}, Status: ${o.status}`);
        for (const m of o.meals) {
            console.log(`  Meal Plan: ${m.mealPlanId}, Name: ${m.name}`);
        }
    }

    await mongoose.disconnect();
    console.log("\nDisconnected.");
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
