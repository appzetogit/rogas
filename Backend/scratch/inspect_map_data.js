import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB:', mongoUri);

  const zoneCol = mongoose.connection.db.collection('food_zones');
  const vendorCol = mongoose.connection.db.collection('food_restaurants');

  const zones = await zoneCol.find({}).toArray();
  const vendors = await vendorCol.find({}).toArray();

  console.log('--- ZONES ---');
  zones.forEach(z => {
    console.log({
      _id: z._id,
      name: z.name || z.zoneName,
      coordCount: z.coordinates ? z.coordinates.length : 0,
      firstCoord: z.coordinates && z.coordinates[0] ? z.coordinates[0] : null,
    });
  });

  console.log('--- VENDORS ---');
  vendors.forEach(v => {
    console.log({
      _id: v._id,
      restaurantName: v.restaurantName,
      location: v.location,
      city: v.city,
    });
  });

  await mongoose.disconnect();
}

run().catch(console.error);
