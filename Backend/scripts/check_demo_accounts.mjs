import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const sampleVendor = await db.collection('food_restaurants').findOne({ status: 'approved' });
  console.log('Sample Approved Vendor Keys:', Object.keys(sampleVendor || {}));
  console.log('Sample Vendor Data:', {
    _id: sampleVendor?._id,
    restaurantName: sampleVendor?.restaurantName,
    name: sampleVendor?.name,
    phone: sampleVendor?.phone,
    mobile: sampleVendor?.mobile,
    contactNumber: sampleVendor?.contactNumber,
    email: sampleVendor?.email,
    status: sampleVendor?.status,
    ownerName: sampleVendor?.ownerName,
    city: sampleVendor?.city,
    zone: sampleVendor?.zone,
    zones: sampleVendor?.zones
  });

  // Also check sample meals/items
  const sampleMeal = await db.collection('dmb_daily_menus').findOne({});
  console.log('Sample Meal:', sampleMeal ? { id: sampleMeal._id, name: sampleMeal.name, price: sampleMeal.price, vendorId: sampleMeal.restaurantId || sampleMeal.vendorId } : 'none');

  const sampleOneTime = await db.collection('dmb_one_time_orders').findOne({});
  console.log('Sample OneTime Order:', sampleOneTime ? { id: sampleOneTime._id, orderNumber: sampleOneTime.orderNumber, status: sampleOneTime.status } : 'none');

  await mongoose.disconnect();
}

run().catch(console.error);
