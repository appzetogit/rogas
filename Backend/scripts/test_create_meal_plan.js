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

  const vendorId = '6a246604c443323ec4e90c3b';
  const token = jwt.sign({ userId: vendorId, role: 'RESTAURANT' }, jwtAccessSecret, { expiresIn: '1h' });

  const client = axios.create({
    baseURL: `http://localhost:${port}/api/v1`,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = {
    name: 'Test Active Meal Plan',
    pricePerDay: 25.50,
    description: 'This is a test meal plan',
    capacity: 20,
    nutrition: {
      calories: 400,
      protein: 20,
      carbs: 30,
      fats: 15,
      isProvided: true
    },
    allergens: ['Dairy'],
    photos: ['https://example.com/image.jpg'],
    status: 'active',
    city: 'indore',
    availableSlots: ['lunch'],
    availableDays: ['mon', 'tue', 'wed', 'thu', 'fri']
  };

  console.log('Sending payload:', JSON.stringify(payload, null, 2));

  try {
    const res = await client.post('/dmb/vendor/meal-plans', payload);
    console.log('Response status:', res.status);
    console.log('Response data:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Request failed:', err.response?.status, err.response?.data || err.message);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
