import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  const vendorCol = mongoose.connection.db.collection('food_restaurants');

  const vendors = await vendorCol.find({}).toArray();
  console.log('--- VENDORS ZONES ---');
  vendors.forEach(v => {
    console.log(`Vendor: ${v.restaurantName}`);
    console.log(` - ID: ${v._id}`);
    console.log(` - zoneId: ${v.zoneId} (${v.zoneId ? v.zoneId.constructor.name : 'null'})`);
    console.log(` - serviceZone: ${v.serviceZone} (${v.serviceZone ? v.serviceZone.constructor.name : 'null'})`);
    console.log(` - city: ${v.city}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
