import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB:', mongoUri);

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('--- DB COLLECTIONS ---');
  collections.forEach(c => console.log(c.name));

  await mongoose.disconnect();
}

run().catch(console.error);
