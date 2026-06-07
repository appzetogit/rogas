import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { DMBMealPlan } from '../src/modules/dailymealbox/mealplan/mealPlan.model.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import { DMBSubscription } from '../src/modules/dailymealbox/subscription/subscription.model.js';

dotenv.config();

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB');

  // Let's test the logic for restaurant ID: 6a246604c443323ec4e90c3b (Eight home)
  const vendorId = '6a246604c443323ec4e90c3b';
  
  console.log('\nTesting orders lookup...');
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filter = { restaurantId: vendorId, deliveryDate: { $gte: today } };
    const orders = await FoodOrder.find(filter).populate('userId', 'name phone');
    console.log('Orders count:', orders.length);
  } catch (e) {
    console.error('Orders query failed:', e);
  }

  console.log('\nTesting meal plans lookup...');
  try {
    const plans = await DMBMealPlan.find({ vendorId }).sort({ createdAt: -1 });
    console.log('Meal plans count:', plans.length);
  } catch (e) {
    console.error('Meal plans query failed:', e);
  }

  console.log('\nTesting earnings lookup...');
  try {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const vendor = await FoodRestaurant.findById(vendorId).select('commissionRate vatRate');
    console.log('Vendor info:', vendor);
    const orders = await FoodOrder.find({
        restaurantId: vendorId,
        orderStatus: 'delivered',
        deliveryDate: { $gte: start }
    });
    console.log('Delivered orders count:', orders.length);
  } catch (e) {
    console.error('Earnings query failed:', e);
  }

  console.log('\nTesting subscriber stats lookup...');
  try {
    const total = await DMBSubscription.countDocuments({ vendorId });
    console.log('Total subscribers:', total);
  } catch (e) {
    console.error('Subscriber stats query failed:', e);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
