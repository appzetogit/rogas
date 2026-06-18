import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected.");

    const DMBDailyOrder = mongoose.model('DMBDailyOrder', new mongoose.Schema({}, { strict: false, collection: 'dmb_daily_orders' }));

    // Find duplicates using aggregation
    const duplicates = await DMBDailyOrder.aggregate([
        {
            $group: {
                _id: {
                    subscriptionId: "$subscriptionId",
                    deliveryDate: "$deliveryDate",
                    deliverySlot: "$deliverySlot"
                },
                docs: { $push: "$_id" },
                count: { $sum: 1 }
            }
        },
        {
            $match: {
                count: { $gt: 1 }
            }
        }
    ]);

    console.log(`Found ${duplicates.length} groups of duplicate orders.`);

    let deletedCount = 0;
    for (const group of duplicates) {
        // Keep the first document, delete the rest
        const keepId = group.docs[0];
        const deleteIds = group.docs.slice(1);
        
        console.log(`For Sub: ${group._id.subscriptionId}, Date: ${group._id.deliveryDate?.toISOString()}, Slot: ${group._id.deliverySlot}:`);
        console.log(`  Keeping: ${keepId}`);
        console.log(`  Deleting: ${deleteIds.join(', ')}`);

        const delResult = await DMBDailyOrder.deleteMany({ _id: { $in: deleteIds } });
        deletedCount += delResult.deletedCount;
    }

    console.log(`\nCleanup complete. Total duplicate orders deleted: ${deletedCount}`);

    // Drop the old index if it exists and create the new correct one
    try {
        console.log("Dropping old index subscriptionId_1_deliveryDate_1 if exists...");
        await DMBDailyOrder.collection.dropIndex("subscriptionId_1_deliveryDate_1");
        console.log("Dropped.");
    } catch (e) {
        console.log("Index subscriptionId_1_deliveryDate_1 did not exist or could not be dropped.");
    }

    try {
        console.log("Creating unique index on subscriptionId_1_deliveryDate_1_deliverySlot_1...");
        await DMBDailyOrder.collection.createIndex(
            { subscriptionId: 1, deliveryDate: 1, deliverySlot: 1 },
            { unique: true }
        );
        console.log("Unique index created successfully.");
    } catch (e) {
        console.error("Failed to create unique index:", e.message);
    }

    await mongoose.disconnect();
    console.log("Disconnected.");
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
