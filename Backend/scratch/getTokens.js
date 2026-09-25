import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodUser } from '../src/core/users/user.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';
import { signAccessToken } from '../src/core/auth/token.util.js';

dotenv.config();

const MONGO_URI = 'mongodb+srv://dailymealboxcom_db_user:qm4QjS8MVTpqiCmD@dailymealbox.qpc69uf.mongodb.net/?appName=DailyMealBox';

async function run() {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('Connected to DB');

        const phoneRegex = /987654321$/;

        const user = await FoodUser.findOne({ phone: { $regex: phoneRegex } });
        if (user) {
            const token = signAccessToken({ userId: user._id, role: 'USER' });
            console.log('\n--- USER ---');
            console.log('User ID:', user._id);
            console.log('Phone:', user.phone);
            console.log('Token:', token);
        } else {
            console.log('\nNo users found with 987654321');
        }

        const restaurant = await FoodRestaurant.findOne({ ownerPhone: { $regex: phoneRegex } });
        if (restaurant) {
            const token = signAccessToken({ userId: restaurant._id, role: 'RESTAURANT' });
            console.log('\n--- RESTAURANT (Vendor) ---');
            console.log('Restaurant ID:', restaurant._id);
            console.log('Phone (ownerPhone):', restaurant.ownerPhone);
            console.log('Token:', token);
        } else {
            console.log('\nNo restaurants found with 987654321');
        }

        const delivery = await FoodDeliveryPartner.findOne({ phone: { $regex: phoneRegex } });
        if (delivery) {
            const token = signAccessToken({ userId: delivery._id, role: 'DELIVERY_PARTNER' });
            console.log('\n--- DELIVERY PARTNER ---');
            console.log('Delivery ID:', delivery._id);
            console.log('Phone:', delivery.phone);
            console.log('Token:', token);
        } else {
            console.log('\nNo delivery partners found with 987654321');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

run();
