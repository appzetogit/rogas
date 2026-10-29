import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const controls = await db.collection('platformcontrols').find({}).toArray();
  console.log('Platform Controls:');
  controls.forEach(c => console.log(`${c.key}:`, JSON.stringify(c.value)));

  const mealPlans = await db.collection('dmb_meal_plans').find({}).limit(5).toArray();
  console.log('\nSample DMB Meal Plans:');
  mealPlans.forEach(m => console.log({ id: m._id, name: m.name, vendorId: m.vendorId, pricePerDay: m.pricePerDay, status: m.status }));

  await mongoose.disconnect();
}

run().catch(console.error);
