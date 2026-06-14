import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB:', mongoUri);

  const orderCol = mongoose.connection.db.collection('dmb_daily_orders');

  // Find duplicates based on subscriptionId and deliveryDate
  const duplicates = await orderCol.aggregate([
    {
      $group: {
        _id: { subscriptionId: '$subscriptionId', deliveryDate: '$deliveryDate' },
        count: { $sum: 1 },
        docs: { $push: { _id: '$_id', status: '$status', createdAt: '$createdAt' } }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    }
  ]).toArray();

  console.log(`Found ${duplicates.length} sets of duplicate daily orders.`);

  for (const dup of duplicates) {
    console.log(`Duplicate set for sub ${dup._id.subscriptionId} on ${dup._id.deliveryDate}:`);
    
    // Sort docs: prefer delivered, ready, preparing, scheduled, and then by createdAt
    const statusPriority = {
      delivered: 5,
      out_for_delivery: 4,
      ready: 3,
      preparing: 2,
      scheduled: 1,
      skipped: 0,
      failed: 0
    };

    dup.docs.sort((a, b) => {
      const prioA = statusPriority[a.status] || 0;
      const prioB = statusPriority[b.status] || 0;
      if (prioA !== prioB) return prioB - prioA; // higher priority first
      return new Date(a.createdAt) - new Date(b.createdAt); // older first
    });

    const toKeep = dup.docs[0];
    const toDelete = dup.docs.slice(1);

    console.log(`  Keeping: ${toKeep._id} (status: ${toKeep.status})`);
    for (const doc of toDelete) {
      console.log(`  Deleting: ${doc._id} (status: ${doc.status})`);
      await orderCol.deleteOne({ _id: doc._id });
    }
  }

  await mongoose.disconnect();
  console.log('Deduplication finished.');
}

run().catch(console.error);
