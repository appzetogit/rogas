import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';
import { FoodUser } from '../src/core/users/user.model.js';
import { FoodDeliveryRoute } from '../src/modules/food/delivery/models/deliveryRoute.model.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB:', mongoUri);

  const resRestaurant = await FoodRestaurant.deleteMany({});
  console.log('Deleted vendors/restaurants:', resRestaurant.deletedCount);

  const resPartner = await FoodDeliveryPartner.deleteMany({});
  console.log('Deleted delivery partners:', resPartner.deletedCount);

  const resUser = await FoodUser.deleteMany({});
  console.log('Deleted users/customers:', resUser.deletedCount);

  const resRoute = await FoodDeliveryRoute.deleteMany({});
  console.log('Deleted delivery routes:', resRoute.deletedCount);

  await mongoose.disconnect();
  console.log('DB cleanup finished.');
}

run().catch(console.error);
