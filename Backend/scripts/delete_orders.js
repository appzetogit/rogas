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

        // Delete Daily Orders
        let res = await mongoose.connection.collection('dmb_daily_orders').deleteMany({});
        console.log(`Deleted ${res.deletedCount} DMB Daily Orders`);

        // Delete Normal Orders
        res = await mongoose.connection.collection('food_orders').deleteMany({});
        console.log(`Deleted ${res.deletedCount} Food Orders`);

        // Delete Collection Batches
        res = await mongoose.connection.collection('dmb_collection_batches').deleteMany({});
        console.log(`Deleted ${res.deletedCount} DMB Collection Batches`);

        // Delete Subscriptions
        res = await mongoose.connection.collection('dmb_subscriptions').deleteMany({});
        console.log(`Deleted ${res.deletedCount} DMB Subscriptions`);

        // Delete Delivery Routes
        res = await mongoose.connection.collection('delivery_routes').deleteMany({});
        console.log(`Deleted ${res.deletedCount} Delivery Routes`);

        console.log('Cleanup complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error during cleanup:', err);
        process.exit(1);
    }
}

run();
