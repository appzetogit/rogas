import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import axios from 'axios';

dotenv.config();

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
const jwtAccessSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const port = process.env.PORT || 5000;

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to DB');

  // Let's get a vendor (Eight home)
  const vendorId = '6a246604c443323ec4e90c3b';
  
  // Generate token
  const token = jwt.sign({ userId: vendorId, role: 'RESTAURANT' }, jwtAccessSecret, { expiresIn: '1h' });
  console.log('Generated Token:', token);

  const client = axios.create({
    baseURL: `http://localhost:${port}/api/v1`,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const endpoints = [
    '/dmb/vendor/orders',
    '/dmb/vendor/meal-plans',
    '/dmb/vendor/earnings',
    '/dmb/vendor/subscriber-stats'
  ];

  for (const endpoint of endpoints) {
    console.log(`\nTesting GET ${endpoint}...`);
    try {
      const res = await client.get(endpoint);
      console.log(`Status: ${res.status}`);
      console.log(`Data success: ${res.data.success}`);
      if (res.data.plans) {
        console.log(`Plans returned: ${res.data.plans.length}`);
      }
      if (res.data.orders) {
        console.log(`Orders returned: ${res.data.orders.length}`);
      }
    } catch (err) {
      console.error(`Error GET ${endpoint}:`, err.response?.status, err.response?.data || err.message);
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
