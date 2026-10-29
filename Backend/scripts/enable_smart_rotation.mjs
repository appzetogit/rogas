import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  await db.collection('dmb_platform_controls').updateOne(
    { key: 'smartRotation', cityId: null },
    { $set: { key: 'smartRotation', cityId: null, value: { enabled: true }, updatedAt: new Date() } },
    { upsert: true }
  );

  console.log('dmb_platform_controls smartRotation updated!');
  await mongoose.disconnect();
}

run().catch(console.error);
