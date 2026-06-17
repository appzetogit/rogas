import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environmental variables
dotenv.config({ path: path.join(process.cwd(), 'Backend', '.env') });
if (!process.env.MONGO_URI) {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
}

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
    console.log("Connecting to Database...");
    await mongoose.connect(mongoUri);
    try {
        const FoodRestaurant = mongoose.model('FoodRestaurant', new mongoose.Schema({}, { strict: false }), 'food_restaurants');
        const CollectionBatch = mongoose.model('CollectionBatch', new mongoose.Schema({}, { strict: false }), 'dmb_collection_batches');

        const vendor = await FoodRestaurant.findOne({ restaurantName: /eight/i });
        if (!vendor) {
            console.log("No vendor named Eight Home/Kitchen found!");
            return;
        }

        console.log(`Found Vendor: ${vendor.restaurantName} (ID: ${vendor._id})`);

        const batches = await CollectionBatch.find({ vendorId: vendor._id }).sort({ createdAt: -1 }).limit(10);
        console.log(`Found ${batches.length} recent batches:`);
        for (const b of batches) {
            console.log(`- BatchId: ${b.batchId}, Date: ${b.deliveryDate}, Slot: ${b.deliverySlot}, PIN/OTP: ${b.collectionPinHash}, Status: ${b.status}, Verified: ${b.pinVerified}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
run();
