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
        const db = mongoose.connection.db;

        // 1. Delete all restaurants
        const resCount = await db.collection('food_restaurants').deleteMany({});
        console.log(`Deleted ${resCount.deletedCount} documents from food_restaurants.`);

        // 2. Delete all delivery partners
        const driverCount = await db.collection('food_delivery_partners').deleteMany({});
        console.log(`Deleted ${driverCount.deletedCount} documents from food_delivery_partners.`);

        // 3. Delete all users
        const userCount = await db.collection('users').deleteMany({});
        console.log(`Deleted ${userCount.deletedCount} documents from users.`);

    } catch (e) {
        console.error("Error executing cleanup:", e);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}
run();
