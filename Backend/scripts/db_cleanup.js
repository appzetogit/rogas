import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('MONGO_URI is not set');
  process.exit(1);
}

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB!');

  const DMBDailyOrder = mongoose.model('DMBDailyOrder', new mongoose.Schema({}, { strict: false, collection: 'dmb_daily_orders' }));

  // Delete all daily orders >= June 10, 2026
  const targetDate = new Date('2026-06-10T00:00:00.000Z');
  const deleteResult = await DMBDailyOrder.deleteMany({
    deliveryDate: { $gte: targetDate }
  });

  console.log(`Deleted ${deleteResult.deletedCount} future daily orders!`);

  // Query remaining orders
  const orders = await DMBDailyOrder.find({}).sort({ deliveryDate: 1 });
  console.log('\n--- REMAINING DAILY ORDERS ---');
  orders.forEach(o => {
    console.log(`OrderID: ${o._id}, DeliveryDate: ${o.deliveryDate?.toISOString().split('T')[0]}, meals:`, JSON.stringify(o.meals));
  });

  await mongoose.disconnect();
}

run().catch(console.error);
