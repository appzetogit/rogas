import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const uri = process.env.MONGODB_URI;

async function run() {
    await mongoose.connect(uri);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const orders = await mongoose.connection.collection('dmb_daily_orders').find({
        deliveryDate: { $gte: today, $lt: tomorrow }
    }).toArray();
    
    console.log("TODAY'S ORDERS COUNT:", orders.length);
    orders.forEach(o => console.log(`Slot: ${o.deliverySlot}, Status: ${o.status}, VendorId: ${o.vendorId}`));

    const batches = await mongoose.connection.collection('dmb_collection_batches').find({}).toArray();
    console.log("ALL BATCHES COUNT:", batches.length);
    batches.forEach(b => console.log(`Slot: ${b.deliverySlot}, Status: ${b.status}, Driver: ${b.driverId}`));
    
    process.exit(0);
}
run();
