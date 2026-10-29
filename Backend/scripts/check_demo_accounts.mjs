import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const vendors = await db.collection('food_restaurants').find({ status: 'approved' }, {
    projection: { restaurantName: 1, ownerName: 1, ownerPhone: 1, primaryContactNumber: 1, isAcceptingOrders: 1, isOnline: 1, city: 1, zoneId: 1 }
  }).limit(5).toArray();

  const drivers = await db.collection('food_delivery_partners').find({ status: 'approved' }, {
    projection: { name: 1, phone: 1, isOnline: 1, isApproved: 1, zoneId: 1, city: 1 }
  }).limit(5).toArray();

  const meals = await db.collection('dmb_daily_menus').find({}).limit(3).toArray();
  const plans = await db.collection('vendor_subscription_plans').find({}).limit(3).toArray();

  console.log('=== APPROVED VENDORS ===', JSON.stringify(vendors, null, 2));
  console.log('=== APPROVED DRIVERS ===', JSON.stringify(drivers, null, 2));
  console.log('=== SAMPLE MEALS ===', meals.map(m => ({ id: m._id, name: m.name || m.title, price: m.price || m.pricePerDay, restaurantId: m.restaurantId })));
  console.log('=== SAMPLE PLANS ===', plans.map(p => ({ id: p._id, name: p.name, price: p.pricePerDay || p.price, vendorId: p.vendorId || p.restaurantId })));

  await mongoose.disconnect();
}

run().catch(console.error);
