import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodRestaurant } from './src/modules/food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from './src/modules/food/delivery/models/deliveryPartner.model.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB:', mongoUri);

  const vendor = await FoodRestaurant.findOne({ restaurantName: /eight/i });
  console.log('Vendor restaurantName:', vendor.restaurantName);
  console.log('vendor.zoneId type:', typeof vendor.zoneId, vendor.zoneId);

  const vendorZoneId = vendor?.zoneId || vendor?.serviceZone;
  const vendorCity = vendor?.city || vendor?.location?.city;

  console.log('vendorZoneId:', vendorZoneId);
  console.log('vendorCity:', vendorCity);

  const driverFilter1 = {
    availabilityStatus: 'online',
    status: 'approved',
  };

  if (vendorZoneId) {
    driverFilter1.$or = [
      { zoneIds: vendorZoneId },
      { city: { $regex: new RegExp(`^${vendorCity}$`, 'i') } }
    ];
  } else if (vendorCity) {
    driverFilter1.city = { $regex: new RegExp(`^${vendorCity}$`, 'i') };
  }

  console.log('driverFilter1:', driverFilter1);
  const matchedDrivers1 = await FoodDeliveryPartner.find(driverFilter1).lean();
  console.log('matchedDrivers1 (with raw string zoneId & regex empty city):', matchedDrivers1.map(d => d.name));

  // Let's test if we cast vendorZoneId to ObjectId explicitly
  const driverFilter2 = {
    availabilityStatus: 'online',
    status: 'approved',
  };

  if (vendorZoneId) {
    // Only add city regex filter if vendorCity is not empty!
    const orList = [
      { zoneIds: new mongoose.Types.ObjectId(vendorZoneId.toString()) }
    ];
    if (vendorCity && vendorCity.trim()) {
      orList.push({ city: { $regex: new RegExp(`^${vendorCity.trim()}$`, 'i') } });
    }
    driverFilter2.$or = orList;
  } else if (vendorCity && vendorCity.trim()) {
    driverFilter2.city = { $regex: new RegExp(`^${vendorCity.trim()}$`, 'i') };
  }

  console.log('driverFilter2:', driverFilter2);
  const matchedDrivers2 = await FoodDeliveryPartner.find(driverFilter2).lean();
  console.log('matchedDrivers2 (with explicit ObjectId cast and ignoring empty city regex):', matchedDrivers2.map(d => d.name));

  await mongoose.disconnect();
}

run().catch(console.error);
