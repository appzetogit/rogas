import { initializeFirebaseRealtime, getFirebaseDB } from './src/config/firebase.js';

async function run() {
    try {
        console.log('Initializing Firebase...');
        await initializeFirebaseRealtime();
        
        const db = getFirebaseDB();
        
        console.log('Wiping all ghost drivers from Firebase delivery_boys node...');
        await db.ref('delivery_boys').remove();
        
        console.log('Successfully wiped delivery_boys node!');
        console.log('Your single active driver app will re-sync its location automatically within seconds.');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
