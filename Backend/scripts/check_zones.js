import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

// Define schema
const zoneSchema = new mongoose.Schema({}, { strict: false, collection: 'food_zones' });
const FoodZone = mongoose.model('FoodZone', zoneSchema);

const restaurantSchema = new mongoose.Schema({}, { strict: false, collection: 'food_restaurants' });
const FoodRestaurant = mongoose.model('FoodRestaurant', restaurantSchema);

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected!');

  const zones = await FoodZone.find({});
  console.log('\n--- ZONES ---');
  zones.forEach(z => {
    console.log(`ID: ${z._id}, Name: ${z.name}, IsActive: ${z.isActive}`);
  });

  const restaurants = await FoodRestaurant.find({});
  console.log('\n--- RESTAURANTS ---');
  restaurants.forEach(r => {
    console.log(`ID: ${r._id}, Name: ${r.restaurantName}, Status: ${r.status}, ZoneId: ${r.zoneId}, Location:`, JSON.stringify(r.location));
  });

  await mongoose.disconnect();
}

run().catch(console.error);
