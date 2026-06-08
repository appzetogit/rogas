import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('MONGO_URI is not set');
  process.exit(1);
}

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB!');

  const DMBDailyMenu = mongoose.model('DMBDailyMenu', new mongoose.Schema({}, { strict: false, collection: 'dmb_daily_menus' }));
  const DMBMealPlan = mongoose.model('DMBMealPlan', new mongoose.Schema({}, { strict: false, collection: 'dmb_meal_plans' }));

  const menus = await DMBDailyMenu.find({ $or: [{ photo: '' }, { photo: { $exists: false } }] });
  console.log(`Found ${menus.length} daily menus with empty photos.`);

  let updatedCount = 0;
  for (const menu of menus) {
    const plan = await DMBMealPlan.findById(menu.mealPlanId).lean();
    if (plan && plan.photos && plan.photos.length > 0) {
      menu.photo = plan.photos[0];
      await DMBDailyMenu.updateOne({ _id: menu._id }, { $set: { photo: plan.photos[0] } });
      console.log(`Updated Menu ${menu._id} (${menu.dishName}) with photo: ${plan.photos[0]}`);
      updatedCount++;
    }
  }

  console.log(`Successfully updated ${updatedCount} daily menus.`);
  await mongoose.disconnect();
}

run().catch(console.error);
