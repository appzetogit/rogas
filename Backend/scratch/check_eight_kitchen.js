import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env from Backend folder
dotenv.config({ path: path.join(process.cwd(), 'Backend', '.env') });

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
    console.log("Connecting to MongoDB at:", mongoUri.replace(/:[^:@]+@/, ':***@'));
    await mongoose.connect(mongoUri);
    console.log("Connected successfully!");

    try {
        const rid = new mongoose.Types.ObjectId("6a30e0b95fb6e91866ca60a0");

        // Models
        const DMBDailyOrder = mongoose.model('DMBDailyOrder', new mongoose.Schema({}, { strict: false }), 'dmb_daily_orders');
        const CollectionBatch = mongoose.model('CollectionBatch', new mongoose.Schema({}, { strict: false }), 'dmb_collection_batches');
        const FoodTransaction = mongoose.model('FoodTransaction', new mongoose.Schema({}, { strict: false }), 'food_transactions');

        // 1. Query dmb_daily_orders for this vendor
        // Note: field might be vendorId or restaurantId. Let's query both.
        const orders = await DMBDailyOrder.find({
            $or: [
                { vendorId: rid },
                { restaurantId: rid }
            ]
        }).lean();

        console.log(`\nFound ${orders.length} daily subscription orders for Eight Kitchen:`);
        for (const o of orders) {
            console.log(`- ID: ${o._id}, Order No: ${o.orderId || o.order_id}, Status: ${o.status || o.orderStatus}, Delivery Date: ${o.deliveryDate}, Meal Plan ID: ${o.mealPlanId}, VendorId: ${o.vendorId}`);
        }

        // 2. Query batches
        const batches = await CollectionBatch.find({ vendorId: rid }).lean();
        console.log(`\nFound ${batches.length} batches for Eight Kitchen:`);
        for (const b of batches) {
            console.log(`- Batch ID: ${b.batchId}, Status: ${b.status}, Verified: ${b.pinVerified}, Box Count: ${b.boxCount}, Driver: ${b.driverId}, OrderIds:`, b.orderIds);
        }

        // 3. Query food_transactions for these orderIds
        if (orders.length > 0) {
            const orderIds = orders.map(o => o._id);
            const txs = await FoodTransaction.find({
                orderId: { $in: orderIds }
            }).lean();
            console.log(`\nFound ${txs.length} food_transactions for these subscription orders:`);
            for (const t of txs) {
                console.log(`- Tx ID: ${t._id}, OrderId: ${t.orderId}, Status: ${t.status}, Amounts:`, JSON.stringify(t.amounts, null, 2));
            }
        }

    } catch (err) {
        console.error("Error during execution:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

run();
