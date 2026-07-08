import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const uri = process.env.MONGODB_URI;

async function run() {
    try {
        await mongoose.connect(uri);
        const db = mongoose.connection;
        
        const partners = await db.collection('food_delivery_partners').find({}).toArray();
        console.log(JSON.stringify(partners, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
