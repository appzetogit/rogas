import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  console.log('Connecting to DB at:', mongoUri);
  await mongoose.connect(mongoUri);
  console.log('Connected to DB successfully!');

  // Primary user-related collections to clear
  const collectionsToClear = [
    // Core users
    'food_users',
    'food_restaurants',
    'food_delivery_partners',
    
    // Wallets
    'food_user_wallets',
    'food_restaurant_wallets',
    'food_delivery_wallets',
    
    // Core transactional / operational collections referencing users
    'food_orders',
    'food_transactions',
    'dmb_daily_orders',
    'food_addons',
    'food_restaurant_menus',
    'food_restaurant_withdrawals',
    'food_delivery_withdrawals',
    'food_delivery_cash_deposits',
    
    // Support tickets / reports
    'food_support_tickets',
    'food_restaurant_support_tickets',
    'delivery_support_tickets',
    'food_safety_emergency_reports',
    'feedback_experiences',
    'account_deletions'
  ];

  const db = mongoose.connection.db;
  const existingCollections = (await db.listCollections().toArray()).map(c => c.name);

  console.log('\n--- STARTING DATABASE CLEANUP ---');

  for (const colName of collectionsToClear) {
    if (existingCollections.includes(colName)) {
      const col = db.collection(colName);
      const beforeCount = await col.countDocuments({});
      if (beforeCount > 0) {
        const result = await col.deleteMany({});
        console.log(`[CLEANED] Collection "${colName}": Deleted ${result.deletedCount} documents.`);
      } else {
        console.log(`[SKIP] Collection "${colName}": Already empty.`);
      }
    } else {
      console.log(`[INFO] Collection "${colName}" does not exist in database.`);
    }
  }

  console.log('\n--- CLEANUP COMPLETE ---');
  await mongoose.disconnect();
  console.log('Disconnected from DB.');
}

run().catch((err) => {
  console.error('Error running database cleanup:', err);
  process.exit(1);
});
