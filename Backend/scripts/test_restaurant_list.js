import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const port = process.env.PORT || 5000;

async function run() {
  const client = axios.create({
    baseURL: `http://localhost:${port}/api/v1`
  });

  try {
    console.log('Case 1: No headers, no zone');
    const res1 = await client.get('/food/restaurant/restaurants', {
      params: { limit: 100, status: 'approved' }
    });
    console.log(`Status: ${res1.status}`);
    console.log(`Restaurants returned: ${res1.data?.data?.restaurants?.length}`);
    res1.data?.data?.restaurants?.forEach(r => console.log(`- ${r.restaurantName} (${r._id})`));
  } catch (err) {
    console.error('Case 1 failed:', err.message);
  }

  try {
    console.log('\nCase 2: With empty X-Zone-Id header');
    const res2 = await client.get('/food/restaurant/restaurants', {
      params: { limit: 100, status: 'approved' },
      headers: { 'X-Zone-Id': '' }
    });
    console.log(`Status: ${res2.status}`);
    console.log(`Restaurants returned: ${res2.data?.data?.restaurants?.length}`);
    res2.data?.data?.restaurants?.forEach(r => console.log(`- ${r.restaurantName} (${r._id})`));
  } catch (err) {
    console.error('Case 2 failed:', err.message);
  }
}

run().catch(console.error);
