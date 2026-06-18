import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected.");

    // Load models
    const DMBSubscription = mongoose.model('DMBSubscription', new mongoose.Schema({}, { strict: false, collection: 'dmb_subscriptions' }));
    const DMBDailyOrder = mongoose.model('DMBDailyOrder', new mongoose.Schema({}, { strict: false, collection: 'dmb_daily_orders' }));
    const DMBDailyMenu = mongoose.model('DMBDailyMenu', new mongoose.Schema({}, { strict: false, collection: 'dmb_daily_menus' }));

    const subs = await DMBSubscription.find({ status: 'active' }).lean();
    console.log(`\n--- Active Subscriptions (${subs.length}) ---`);
    for (const sub of subs) {
        console.log(`SubID: ${sub.subscriptionId}, UserID: ${sub.userId}, VendorID: ${sub.vendorId}, Start: ${sub.startDate?.toISOString()}, End: ${sub.endDate?.toISOString()}, DeliveryDays: ${sub.deliveryDays}, Slots: ${JSON.stringify(sub.deliverySlots || sub.deliverySlot)}`);
    }

    const menus = await DMBDailyMenu.find({
        date: {
            $gte: new Date('2026-06-19T00:00:00.000Z'),
            $lte: new Date('2026-06-22T00:00:00.000Z')
        }
    }).lean();
    console.log(`\n--- DMBDailyMenu (June 19-22) (${menus.length}) ---`);
    for (const m of menus) {
        console.log(`ID: ${m._id}, Date: ${m.date?.toISOString()}, Slot: ${m.slot}, Plan: ${m.mealPlanId}, Dish: ${m.dishName}`);
    }

    const orders = await DMBDailyOrder.find({
        deliveryDate: {
            $gte: new Date('2026-06-19T00:00:00.000Z'),
            $lte: new Date('2026-06-22T00:00:00.000Z')
        }
    }).lean();
    console.log(`\n--- DMBDailyOrder (June 19-22) (${orders.length}) ---`);
    for (const o of orders) {
        console.log(`OrderID: ${o.orderId}, SubID: ${o.subscriptionId}, UserID: ${o.userId}, Date: ${o.deliveryDate?.toISOString()}, Slot: ${o.deliverySlot}, Status: ${o.status}`);
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
