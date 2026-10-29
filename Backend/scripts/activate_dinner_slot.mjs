import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  // Set breakfast end time to 08:00 and dinner start time to 08:00 so dinner is the active slot right now!
  await db.collection('vendor_timing_settings').updateOne({ isActive: true }, {
    $set: {
      'breakfast.endTime': '08:00',
      'dinner.startTime': '08:00',
      'dinner.endTime': '23:00'
    }
  });
  await db.collection('dmb_delivery_slots').updateOne({ key: 'breakfast' }, {
    $set: { endTime: '08:00' }
  });
  await db.collection('dmb_delivery_slots').updateOne({ key: 'dinner' }, {
    $set: { startTime: '08:00', endTime: '23:00' }
  });

  console.log('Successfully adjusted slots so Dinner is currently the active slot!');
  await mongoose.disconnect();
}

run().catch(console.error);
