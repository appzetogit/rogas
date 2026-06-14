import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB:', mongoUri);

  const vendorId = '6a246604c443323ec4e90c3b';
  const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName location zoneId serviceZone city phone');
  const vendorZoneId = vendor?.zoneId || vendor?.serviceZone;
  const vendorCity = vendor?.city || vendor?.location?.city;

  console.log('vendorZoneId:', vendorZoneId);
  console.log('vendorCity:', vendorCity);

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

  console.log('driverFilter:', JSON.stringify(driverFilter, null, 2));

  const onlineDrivers = await FoodDeliveryPartner.find(driverFilter);
  console.log('FOUND DRIVERS COUNT:', onlineDrivers.length);
  onlineDrivers.forEach(d => {
    console.log(`Driver: ${d.name}, isOnline: ${d.isOnline}, availabilityStatus: ${d.availabilityStatus}, zoneIds: ${JSON.stringify(d.zoneIds)}, city: ${d.city}, status: ${d.status}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
