import axios from 'axios';

async function testDelete() {
  try {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2YTEzZWRiYThjNTU3NDRkNDU1NjIxMGIiLCJyb2xlIjoiQURNSU4iLCJpYXQiOjE3Nzk2OTA5MzgsImV4cCI6MTc3OTY5NDUzOH0.hkFmLESXwApi6Wx85pHmXy6im1Kg9HQEIHMs7bq-z5U';
    const delResp = await axios.delete('http://localhost:5000/api/v1/food/admin/delivery/5f8d0d55b54764421b7156d9', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("DELETE response:", delResp.data);
  } catch (err) {
    if (err.response) {
      console.error("HTTP ERROR", err.response.status);
      console.log("Data:", typeof err.response.data === 'string' ? err.response.data.substring(0, 100) : err.response.data);
    } else {
      console.error("NETWORK ERROR", err.message);
    }
  }
}

testDelete();
