import { getOperationsSnapshot } from '../src/modules/food/admin/services/prdAdmin.service.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB:', mongoUri);

  const result = await getOperationsSnapshot();
  console.log('--- OPERATIONS SNAPSHOT DRIVERS ---');
  console.log(JSON.stringify(result.drivers, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
