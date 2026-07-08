import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const uri = process.env.MONGODB_URI;

async function run() {
    try {
        await mongoose.connect(uri);
        const db = mongoose.connection;
        
        const INDORE_ZONE_ID = '69b85a63fb04545984776cdb';
        
        // Delete all zones except Indore
        const result = await db.collection('food_zones').deleteMany({
            _id: { $ne: new mongoose.Types.ObjectId(INDORE_ZONE_ID) }
        });
        
        console.log(`Successfully deleted ${result.deletedCount} test zones!`);
        console.log('Only the "Indore" zone remains, which is mapped to your vendor and driver.');
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
