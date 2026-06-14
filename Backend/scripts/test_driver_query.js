import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB:', mongoUri);

  const vendorCol = mongoose.connection.db.collection('food_restaurants');
  const driverCol = mongoose.connection.db.collection('food_delivery_partners');

  const vendor = await vendorCol.findOne({ restaurantName: /eight/i });
  const vendorZoneId = vendor?.zoneId || vendor?.serviceZone;
  const vendorCity = vendor?.city || vendor?.location?.city;

  console.log('--- VENDOR INFO ---');
  console.log({
    _id: vendor?._id,
    restaurantName: vendor?.restaurantName,
    zoneId: vendor?.zoneId,
    zoneId_type: vendor?.zoneId ? vendor.zoneId.constructor.name : 'null',
    serviceZone: vendor?.serviceZone,
    serviceZone_type: vendor?.serviceZone ? vendor.serviceZone.constructor.name : 'null',
    city: vendor?.city,
  });

  const rashi = await driverCol.findOne({ name: /rashi/i });
  console.log('\n--- DRIVER RASHI INFO ---');
  if (rashi) {
    console.log({
      _id: rashi._id,
      name: rashi.name,
      status: rashi.status,
      availabilityStatus: rashi.availabilityStatus,
      city: rashi.city,
      zoneIds: rashi.zoneIds,
      zoneIds_types: rashi.zoneIds ? rashi.zoneIds.map(z => z.constructor.name) : []
    });
  } else {
    console.log('Driver Rashi not found!');
  }

  const driverFilter = {
    availabilityStatus: 'online',
    status: 'approved',
  };

  if (vendorZoneId) {
    driverFilter.$or = [
      { zoneIds: vendorZoneId },
      { city: { $regex: new RegExp(`^${vendorCity}$`, 'i') } }
    ];
  } else {
    driverFilter.city = { $regex: new RegExp(`^${vendorCity}$`, 'i') };
  }

  console.log('\nDriver filter query:', JSON.stringify(driverFilter, null, 2));

  const matchingDrivers = await driverCol.find(driverFilter).toArray();
  console.log('Matching online drivers count:', matchingDrivers.length);
  matchingDrivers.forEach(d => {
    console.log(`Matching Driver: ${d.name}, ID: ${d._id}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
