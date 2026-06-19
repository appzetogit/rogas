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
  const snapshot = await db.ref('delivery_boys').once('value');
  console.log('--- FIREBASE DELIVERY_BOYS DATA ---');
  console.log(JSON.stringify(snapshot.val(), null, 2));
  process.exit(0);
}

run().catch(console.error);
