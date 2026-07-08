import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const uri = process.env.MONGODB_URI;

async function run() {
    try {
        await mongoose.connect(uri);
        const db = mongoose.connection;
        
        const order = await db.collection('food_orders').findOne({ deliveryPartnerId: { $ne: null } });
        if (order) {
            console.log('Order ID:', order._id);
            console.log('root deliveryPartnerId:', order.deliveryPartnerId);
            console.log('Type of root deliveryPartnerId:', typeof order.deliveryPartnerId);
            console.log('Is root deliveryPartnerId ObjectId:', order.deliveryPartnerId instanceof mongoose.Types.ObjectId);
        } else {
            console.log('No order found with deliveryPartnerId');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
