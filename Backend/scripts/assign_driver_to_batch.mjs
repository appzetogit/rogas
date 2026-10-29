import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const driver = await db.collection('food_delivery_partners').findOne({ phone: '8987654321' });
  const batch = await db.collection('dmb_collection_batches').findOne({ batchId: 'DMB-BATCH-66486533' });
  const order = await db.collection('dmb_daily_orders').findOne({ _id: new mongoose.Types.ObjectId('6ae1a3f0ee21744c991083a1') });

  const { readCollectionPin } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js');
  const pin = readCollectionPin(batch);

  await db.collection('dmb_collection_batches').updateOne({ _id: batch._id }, {
    $set: {
      driverId: driver._id,
      status: 'driver_assigned',
      assignedAt: new Date()
    }
  });

  await db.collection('dmb_daily_orders').updateOne({ _id: order._id }, {
    $set: {
      'dispatch.deliveryPartnerId': driver._id,
      collectionPin: pin
    }
  });

  console.log('Successfully assigned driver', driver.name, 'to batch', batch.batchId);
  console.log('Collection PIN is:', pin);

  await mongoose.disconnect();
}

run().catch(console.error);
