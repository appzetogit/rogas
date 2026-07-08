import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const uri = process.env.MONGODB_URI;

async function run() {
    try {
        await mongoose.connect(uri);
        const db = mongoose.connection;
        
        const dmbOrders = await db.collection('dmb_daily_orders').find({ 'ratings.deliveryPartner.rating': { $exists: true, $ne: null } }).toArray();
        console.log('DMB Order reviews:', dmbOrders.length);
        if (dmbOrders.length > 0) {
            console.log(JSON.stringify(dmbOrders[0], null, 2));
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
