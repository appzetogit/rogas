import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

mongoose.connect(uri).then(async () => {
    const subCol = mongoose.connection.collection('dmb_subscriptions');
    const brokenSubs = await subCol.find({ "pricing.totalPrice": 0, source: 'office' }).toArray();
    console.log(JSON.stringify(brokenSubs, null, 2));
    await mongoose.disconnect();
}).catch(console.error);
