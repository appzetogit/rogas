import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import { getDeliveryEarnings } from './src/modules/food/admin/services/admin.service.js';

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const data = await getDeliveryEarnings({ period: 'all' });
        console.log(JSON.stringify(data.earnings[0], null, 2));
    } catch (e) {
        console.error("ERROR CAUGHT:");
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
run();
