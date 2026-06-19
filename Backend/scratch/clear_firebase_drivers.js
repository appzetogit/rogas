import { initializeFirebaseRealtime, getFirebaseDB } from '../src/config/firebase.js';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  const initialized = initializeFirebaseRealtime();
  if (!initialized) {
    console.log('Firebase failed to initialize.');
    return;
  }
  const db = getFirebaseDB();
  console.log('Clearing delivery_boys node in Firebase...');
  await db.ref('delivery_boys').remove();
  console.log('Successfully cleared all delivery boy locations from Firebase Realtime DB.');
  process.exit(0);
}

run().catch(console.error);
