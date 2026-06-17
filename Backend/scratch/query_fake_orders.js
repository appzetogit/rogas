import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const dailyOrdersCol = db.collection('dmb_daily_orders');
  const collectionBatchesCol = db.collection('dmb_collection_batches');
  const usersCol = db.collection('food_users');

  const mockVendorId = new mongoose.Types.ObjectId('6a2441b7b7d8e8b095b62164');

  const mockVendorOrders = await dailyOrdersCol.find({ vendorId: mockVendorId }).toArray();
  console.log(`Found ${mockVendorOrders.length} orders for mock vendor 6a2441b7b7d8e8b095b62164.`);

  const mockVendorBatches = await collectionBatchesCol.find({ vendorId: mockVendorId }).toArray();
  console.log(`Found ${mockVendorBatches.length} batches for mock vendor 6a2441b7b7d8e8b095b62164.`);
  mockVendorBatches.forEach(b => {
     console.log(`Batch ID: ${b.batchId} | Orders Count: ${b.orderIds?.length} | Status: ${b.status}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
