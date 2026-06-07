import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
console.log('Connecting to Mongo URI:', mongoUri);

if (!mongoUri) {
  console.error('MONGO_URI is not set in .env');
  process.exit(1);
}

// Define schemas
const restaurantSchema = new mongoose.Schema({}, { strict: false, collection: 'food_restaurants' });
const mealPlanSchema = new mongoose.Schema({}, { strict: false, collection: 'dmb_meal_plans' });

const FoodRestaurant = mongoose.model('FoodRestaurant', restaurantSchema);
const DMBMealPlan = mongoose.model('DMBMealPlan', mealPlanSchema);

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected successfully!');

  const restaurants = await FoodRestaurant.find({});
  console.log('\n--- RESTAURANTS ---');
  restaurants.forEach(r => {
    console.log(`ID: ${r._id}, Name: ${r.restaurantName}, Status: ${r.status}, City: ${r.city}`);
  });

  const plans = await DMBMealPlan.find({});
  console.log('\n--- MEAL PLANS ---');
  plans.forEach(p => {
    console.log(`ID: ${p._id}, VendorId: ${p.vendorId}, Name: ${p.name}, Status: ${p.status}, City: ${p.city}, Description: ${p.description}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
