import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DMBSubscription } from '../src/modules/dailymealbox/subscription/subscription.model.js';
import { ensureOrdersForUser } from '../src/modules/dailymealbox/subscription/dmb.dailyOrder.service.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected.");

    // Update all active subscriptions to full_week
    const result = await DMBSubscription.updateMany(
        { status: 'active' },
        { $set: { deliveryDays: 'full_week' } }
    );
    console.log(`Updated ${result.modifiedCount} active subscriptions to "full_week".`);

    // Fetch updated active subscriptions
    const activeSubs = await DMBSubscription.find({ status: 'active' }).lean();

    // Re-run order generation for each affected user
    for (const sub of activeSubs) {
        console.log(`Regenerating orders for User: ${sub.userId} (Sub: ${sub.subscriptionId})...`);
        await ensureOrdersForUser(sub.userId);
    }

    console.log("Order regeneration complete.");
    await mongoose.disconnect();
    console.log("Disconnected.");
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
