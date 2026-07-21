import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
console.log('Connecting to MongoDB...');

await mongoose.connect(uri);
const col = mongoose.connection.collection('office_employees');

const indexes = await col.indexes();
console.log('Existing indexes:', indexes.map(i => i.name));

try {
    await col.dropIndex('adminId_1_email_1');
    console.log('SUCCESS: Stale index adminId_1_email_1 dropped');
} catch (e) {
    if (e.message.includes('index not found')) {
        console.log('INFO: Index adminId_1_email_1 does not exist (already clean)');
    } else {
        console.log('Drop result:', e.message);
    }
}

// List indexes after operation
const newIndexes = await col.indexes();
console.log('Indexes after cleanup:', newIndexes.map(i => i.name));

await mongoose.disconnect();
console.log('Done.');
