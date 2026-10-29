import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const vendorId = new mongoose.Types.ObjectId('6a4cb906c7427ab4f93b16f8');
  const { localToday } = await import('../src/utils/platformTime.js');
  const today = localToday();
  const nextDay = new Date(today.getTime() + 86400000);

  const orders = await db.collection('dmb_daily_orders').find({
    vendorId,
    deliveryDate: { $gte: today, $lt: nextDay },
    deliverySlot: 'dinner'
  }).toArray();

  console.log('Vendor dinner orders today count:', orders.length);
  orders.forEach(o => console.log('Order:', o._id, 'status:', o.status, 'instructions:', o.specialInstructions, 'ack:', o.specialInstructionsAckAt));

  const batches = await db.collection('dmb_collection_batches').find({
    vendorId,
    deliveryDate: { $gte: today, $lt: nextDay }
  }).toArray();
  console.log('Batches for vendor today count:', batches.length);
  batches.forEach(b => console.log('Batch:', b.batchId, 'status:', b.status, 'collectionPinHash:', b.collectionPinHash, 'driverId:', b.driverId));

  // Now let's manually run triggerDriverNotificationIfAllReady and see what happens or errors
  const { triggerDriverNotificationIfAllReady } = await import('../src/modules/dailymealbox/subscription/dmb.dailyOrder.service.js');
  const res = await triggerDriverNotificationIfAllReady(vendorId, today, 'dinner');
  console.log('triggerDriverNotificationIfAllReady result:', res);

  // Check batches again
  const batchesAfter = await db.collection('dmb_collection_batches').find({
    vendorId,
    deliveryDate: { $gte: today, $lt: nextDay }
  }).toArray();
  console.log('Batches after count:', batchesAfter.length);
  for (const b of batchesAfter) {
    const { readCollectionPin } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js');
    console.log('Batch after:', b.batchId, 'PIN:', readCollectionPin(b), 'driverId:', b.driverId);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
