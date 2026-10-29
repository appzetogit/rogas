import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Find daily orders created today
  const dailyOrders = await db.collection('dmb_daily_orders').find({ createdAt: { $gte: todayStart } }).toArray();
  const subIds = [...new Set(dailyOrders.map(o => o.subscriptionId).filter(Boolean))];

  console.log(`Found ${dailyOrders.length} daily orders created today.`);
  console.log(`Found ${subIds.length} subscriptions tied to today's test.`);

  // Find collection batches created today
  const batches = await db.collection('dmb_collection_batches').find({ createdAt: { $gte: todayStart } }).toArray();
  console.log(`Found ${batches.length} collection batches created today.`);

  // Delete today's daily orders
  const delOrders = await db.collection('dmb_daily_orders').deleteMany({ createdAt: { $gte: todayStart } });
  console.log(`Deleted ${delOrders.deletedCount} daily orders.`);

  // Delete today's subscriptions
  const delSubs = await db.collection('dmb_subscriptions').deleteMany({
    $or: [
      { createdAt: { $gte: todayStart } },
      { _id: { $in: subIds } }
    ]
  });
  console.log(`Deleted ${delSubs.deletedCount} subscriptions.`);

  // Delete today's collection batches
  const delBatches = await db.collection('dmb_collection_batches').deleteMany({ createdAt: { $gte: todayStart } });
  console.log(`Deleted ${delBatches.deletedCount} collection batches.`);

  // Also clean any payments created today
  const delPayments = await db.collection('payment_transactions').deleteMany({ createdAt: { $gte: todayStart } });
  console.log(`Deleted ${delPayments.deletedCount} payment transactions.`);

  await mongoose.disconnect();
  console.log('✅ Cleanup complete! Ready for fresh demo.');
}

run().catch(console.error);
