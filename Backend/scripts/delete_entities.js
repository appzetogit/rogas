import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const uri = process.env.MONGODB_URI;

async function run() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(uri);
        console.log('Connected to MongoDB.');

        // Delete all Users
        const userRes = await mongoose.connection.collection('food_users').deleteMany({});
        console.log(`Deleted ${userRes.deletedCount} Users (food_users)`);

        // Delete all Vendors/Restaurants
        const vendorRes = await mongoose.connection.collection('food_restaurants').deleteMany({});
        console.log(`Deleted ${vendorRes.deletedCount} Vendors (food_restaurants)`);

        // Delete all Delivery Partners
        const deliveryRes = await mongoose.connection.collection('food_delivery_partners').deleteMany({});
        console.log(`Deleted ${deliveryRes.deletedCount} Delivery Boys (food_delivery_partners)`);

        console.log('Cleanup complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error during cleanup:', err);
        process.exit(1);
    }
}

run();
