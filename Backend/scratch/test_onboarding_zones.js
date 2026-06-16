import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { registerRestaurant } from '../src/modules/food/restaurant/services/restaurant.service.js';

dotenv.config();

// 1. Mock Cloudinary's upload stream so we do not hit live network APIs
cloudinary.uploader.upload_stream = (options, callback) => {
    return {
        end: (buffer) => {
            const isPdf = options.format === 'pdf' || options.folder?.includes('pdf');
            const url = isPdf
                ? 'https://res.cloudinary.com/demo/raw/upload/v12345/fake_menu.pdf'
                : 'https://res.cloudinary.com/demo/image/upload/v12345/fake_image.png';
            callback(null, { secure_url: url });
        }
    };
};

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
    console.log('Connecting to database...');
    await mongoose.connect(mongoUri);
    console.log('Connected!');

    // 2. Ensure a test zone exists
    console.log('\n--- Setting up test zone ---');
    let testZone = await FoodZone.findOne({ name: 'Onboarding Test Zone' });
    if (!testZone) {
        testZone = await FoodZone.create({
            name: 'Onboarding Test Zone',
            zoneName: 'Onboarding Test Zone Name',
            country: 'India',
            coordinates: [
                { longitude: 77.0, latitude: 28.0 },
                { longitude: 78.0, latitude: 28.0 },
                { longitude: 78.0, latitude: 29.0 },
                { longitude: 77.0, latitude: 29.0 }
            ],
            isActive: true
        });
    }
    console.log(`Test Zone ID: ${testZone._id}, Name: ${testZone.name}`);

    // Clean up any old test restaurant with our test phone
    const testPhone = '9999900000';
    await FoodRestaurant.deleteMany({ ownerPhone: testPhone });

    // 3. Prepare registration payload
    console.log('\n--- Simulating new vendor registration payload ---');
    const payload = {
        restaurantName: 'Onboarding Test Kitchen',
        ownerName: 'Alice Tester',
        ownerEmail: 'alice@gmail.com',
        ownerPhone: testPhone,
        primaryContactNumber: testPhone,
        pureVegRestaurant: true,
        addressLine1: 'Building 4B',
        addressLine2: 'Tech Park',
        area: 'Sector 62',
        city: 'Noida',
        state: 'Uttar Pradesh',
        pincode: '201301',
        landmark: 'Opposite Metro Station',
        formattedAddress: 'Building 4B, Sector 62, Noida, UP',
        latitude: 28.6289,
        longitude: 77.3712,
        zoneId: testZone._id.toString(),
        cuisines: ['North Indian', 'Chinese'],
        openingTime: '09:00 AM',
        closingTime: '10:00 PM',
        openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        estimatedDeliveryTime: '30-40 mins',
        panNumber: 'ABCDE1234F',
        nameOnPan: 'Alice Tester',
        gstRegistered: false,
        fssaiNumber: '12345678901234',
        fssaiExpiry: '2030-12-31',
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001234',
        accountHolderName: 'Alice Tester',
        accountType: 'Saving'
    };

    // Prepare mock files
    const mockBuffer = Buffer.from('mock file data');
    const files = {
        profileImage: [{ buffer: mockBuffer, originalname: 'profile.jpg', mimetype: 'image/jpeg' }],
        panImage: [{ buffer: mockBuffer, originalname: 'pan.jpg', mimetype: 'image/jpeg' }],
        fssaiImage: [{ buffer: mockBuffer, originalname: 'fssai.jpg', mimetype: 'image/jpeg' }],
        coverImage: [{ buffer: mockBuffer, originalname: 'cover.jpg', mimetype: 'image/jpeg' }],
        menuPdf: [{ buffer: mockBuffer, originalname: 'menu.pdf', mimetype: 'application/pdf' }],
        menuImages: [{ buffer: mockBuffer, originalname: 'menu.jpg', mimetype: 'image/jpeg' }]
    };

    // 4. Register the restaurant
    console.log('Registering restaurant...');
    const result = await registerRestaurant(payload, files);
    console.log(`Successfully registered! Document ID: ${result._id}`);

    // 5. Query from database directly to verify fields
    const doc = await FoodRestaurant.findById(result._id).lean();
    console.log('\n--- Verification Assertions ---');
    console.log(`Saved zoneId: ${doc.zoneId} (Expected: ${testZone._id})`);
    console.log(`Saved zoneName: "${doc.zoneName}" (Expected: "${testZone.name}")`);
    console.log(`Saved location.latitude: ${doc.location?.latitude} (Expected: 28.6289)`);
    console.log(`Saved location.longitude: ${doc.location?.longitude} (Expected: 77.3712)`);
    console.log(`Saved location.formattedAddress: "${doc.location?.formattedAddress}"`);
    console.log(`Saved location.addressLine1: "${doc.location?.addressLine1}"`);
    console.log(`Saved location.city: "${doc.location?.city}"`);

    // Run Assertions
    if (String(doc.zoneId) !== String(testZone._id)) {
        throw new Error('Assertion Failed: zoneId mismatch!');
    }
    if (doc.zoneName !== testZone.name) {
        throw new Error(`Assertion Failed: zoneName mismatch! Got "${doc.zoneName}", expected "${testZone.name}"`);
    }
    if (doc.location?.latitude !== 28.6289 || doc.location?.longitude !== 77.3712) {
        throw new Error('Assertion Failed: GPS coordinates mismatch!');
    }
    if (doc.location?.formattedAddress !== 'Building 4B, Sector 62, Noida, UP') {
        throw new Error('Assertion Failed: formattedAddress mismatch!');
    }
    if (doc.location?.city !== 'Noida' || doc.location?.pincode !== '201301') {
        throw new Error('Assertion Failed: address field mismatch!');
    }

    console.log('\n=== ALL ONBOARDING ZONE & LOCATION TEST ASSERTIONS PASSED ===');

    // 6. Cleanup test records
    console.log('Cleaning up database...');
    await FoodRestaurant.deleteOne({ _id: doc._id });
    console.log('Cleaned up successfully!');

}

run().catch(err => {
    console.error('TEST FLOW ENCOUNTERED AN ERROR:', err);
    process.exit(1);
}).finally(() => {
    mongoose.disconnect();
});
