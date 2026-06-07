import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DMBDurationPlan } from '../src/modules/dailymealbox/subscription/durationPlan.model.js';
import { DMBSubscription } from '../src/modules/dailymealbox/subscription/subscription.model.js';

dotenv.config();

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

async function run() {
  if (!mongoUri) {
    console.error('MONGO_URI is not defined in environment variables');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB database!');

  // 1. Verify DMBDurationPlans seeding
  const plans = await DMBDurationPlan.find({});
  console.log('\n--- SEEDED DURATION PLANS ---');
  if (plans.length === 0) {
    console.log('No duration plans found! The server might not have run the seeding logic yet.');
  } else {
    plans.forEach(plan => {
      console.log(`Plan label: ${plan.label}`);
      console.log(` - Code: ${plan.code}`);
      console.log(` - DaysCountMonFri: ${plan.daysCountMonFri}`);
      console.log(` - DaysCountFullWeek: ${plan.daysCountFullWeek}`);
      console.log(` - Description: ${plan.description}`);
      console.log(` - IsActive: ${plan.isActive}`);
      console.log('-----------------------------');
    });
  }

  // 2. Query some subscriptions to ensure schema validation behaves with new meals/durations fields
  const sampleSub = await DMBSubscription.findOne({ meals: { $exists: true } });
  console.log('\n--- SAMPLE NEW FORMAT SUBSCRIPTION ---');
  if (sampleSub) {
    console.log(`ID: ${sampleSub.subscriptionId}`);
    console.log(`Status: ${sampleSub.status}`);
    console.log(`Duration: ${sampleSub.duration}`);
    console.log(`Meals:`, JSON.stringify(sampleSub.meals));
    console.log(`Pricing:`, JSON.stringify(sampleSub.pricing));
  } else {
    console.log('No subscription using the new format has been created yet.');
  }



  await mongoose.disconnect();
  console.log('Disconnected!');
}

run().catch(console.error);
