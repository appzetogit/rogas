import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB:', mongoUri);

  const driverCol = mongoose.connection.db.collection('food_delivery_partners');
  const drivers = await driverCol.find({}).toArray();

  console.log(`Total delivery partners in database: ${drivers.length}`);
  drivers.forEach(d => {
    console.log(JSON.stringify(d, null, 2));
  });

  await mongoose.disconnect();
}

run().catch(console.error);
