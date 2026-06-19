import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB:', mongoUri);

  const driverCol = mongoose.connection.db.collection('food_delivery_partners');
  const result = await driverCol.updateOne(
    { name: /Vivek/i },
    {
      $set: {
        lastLat: 22.695355,
        lastLng: 75.828554,
        lastLocationAt: new Date(),
        availabilityStatus: 'online'
      }
    }
  );

  console.log('Update result:', result);
  await mongoose.disconnect();
}

run().catch(console.error);
