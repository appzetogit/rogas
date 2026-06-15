import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { AppConfig } from '../src/core/appConfig/appConfig.model.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(mongoUri);
  console.log('Connected to database.');

  const targetTheme = {
    appName: 'admin_app',
    primaryColor: '#1F7A63',
    secondaryColor: '#165A49',
    backgroundColor: '#F5F5F0',
    textColor: '#2B2B2B'
  };

  console.log('Updating/upserting admin_app theme configuration in the database...');
  const updated = await AppConfig.findOneAndUpdate(
    { appName: 'admin_app' },
    { $set: targetTheme },
    { new: true, upsert: true }
  );

  console.log('Theme configuration updated successfully in DB:', updated);
  
  await mongoose.connection.close();
  console.log('Database connection closed.');
}

run().catch(err => {
  console.error('Error updating theme in database:', err);
  process.exit(1);
});
