import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const readyOrders = await db.collection('dmb_daily_orders').find({ status: { $in: ['ready', 'preparing'] } }).toArray();
  console.log('Ready/Preparing orders count:', readyOrders.length);
  console.log('Ready/Preparing orders:', readyOrders.map(o => ({
    id: o._id,
    deliveryDate: o.deliveryDate,
    status: o.status,
    vendorId: o.vendorId,
    dispatch: o.dispatch,
    updatedAt: o.updatedAt
  })));

  const recent = await db.collection('dmb_daily_orders').find({}).sort({ updatedAt: -1 }).limit(5).toArray();
  console.log('Top 5 recently updated daily orders:');
  recent.forEach(o => console.log({
    id: o._id,
    deliveryDate: o.deliveryDate,
    slot: o.deliverySlot,
    status: o.status,
    vendorId: o.vendorId,
    dispatch: o.dispatch,
    updatedAt: o.updatedAt
  }));

  // Check driver assigned or shifts for today
  const shifts = await db.collection('food_delivery_shift_requests').find({}).sort({ createdAt: -1 }).limit(5).toArray();
  console.log('Recent shifts count:', shifts.length);

  await mongoose.disconnect();
}

run().catch(console.error);
