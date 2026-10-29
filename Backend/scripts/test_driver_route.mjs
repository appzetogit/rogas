import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const driver = await db.collection('food_delivery_partners').findOne({ phone: '8987654321' });
  const { localToday } = await import('../src/utils/platformTime.js');
  const today = localToday();
  const tomorrow = new Date(today.getTime() + 86400000);

  const orders = await db.collection('dmb_daily_orders').find({
    vendorId: { $in: driver.assignedVendors },
    deliveryDate: { $gte: today, $lt: tomorrow },
    deliverySlot: 'dinner',
    status: { $nin: ['delivered', 'skipped', 'failed'] }
  }).toArray();

  console.log(`Found ${orders.length} dinner orders for this driver:`);
  for (const o of orders) {
    console.log(`Order ${o._id}: status=${o.status}, slot=${o.deliverySlot}`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
