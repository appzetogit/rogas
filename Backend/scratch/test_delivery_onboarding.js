import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';
import { approveDeliveryPartner } from '../src/modules/food/admin/services/admin.service.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
    console.log('Connecting to database...');
    await mongoose.connect(mongoUri);
    console.log('Connected!');

    // 1. Setup Test Zone
    console.log('\n--- Setting up test zone ---');
    let testZone = await FoodZone.findOne({ name: 'Delivery Test Zone' });
    if (!testZone) {
        testZone = await FoodZone.create({
            name: 'Delivery Test Zone',
            zoneName: 'Delivery Test Zone Name',
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

    // Clean up any old test partners
    const testPhone = '8888800000';
    await FoodDeliveryPartner.deleteMany({ phone: testPhone });

    // 2. Setup mock delivery partner
    console.log('\n--- Creating a pending delivery partner ---');
    const partner = await FoodDeliveryPartner.create({
        name: 'Test Driver',
        phone: testPhone,
        email: 'testdriver@gmail.com',
        city: 'Noida',
        state: 'Uttar Pradesh',
        status: 'pending'
    });
    console.log(`Pending Driver ID: ${partner._id}, Status: ${partner.status}`);

    // 3. Test: Approve without a zoneId
    console.log('\n--- Test 1: Approve without zoneId ---');
    try {
        await approveDeliveryPartner(partner._id, null);
        throw new Error('Test failed: Should not allow approval without zoneId');
    } catch (err) {
        console.log(`Expected Error Caught: ${err.message}`);
        if (!err.message.includes('Zone ID must be assigned')) {
            throw new Error(`Unexpected error message: ${err.message}`);
        }
    }

    // 4. Test: Approve with invalid zoneId format
    console.log('\n--- Test 2: Approve with invalid zoneId format ---');
    try {
        await approveDeliveryPartner(partner._id, 'invalid-id-format');
        throw new Error('Test failed: Should not allow approval with invalid zoneId format');
    } catch (err) {
        console.log(`Expected Error Caught: ${err.message}`);
        if (!err.message.includes('Zone ID must be assigned')) {
            throw new Error(`Unexpected error message: ${err.message}`);
        }
    }

    // 5. Test: Approve with non-existent zoneId
    console.log('\n--- Test 3: Approve with non-existent zoneId ---');
    const nonExistentZoneId = new mongoose.Types.ObjectId();
    try {
        await approveDeliveryPartner(partner._id, nonExistentZoneId.toString());
        throw new Error('Test failed: Should not allow approval with non-existent zoneId');
    } catch (err) {
        console.log(`Expected Error Caught: ${err.message}`);
        if (!err.message.includes('zone does not exist')) {
            throw new Error(`Unexpected error message: ${err.message}`);
        }
    }

    // 6. Test: Approve with valid zoneId
    console.log('\n--- Test 4: Approve with valid zoneId ---');
    const approvedPartner = await approveDeliveryPartner(partner._id, testZone._id.toString());
    console.log(`Approved Driver status: ${approvedPartner.status}`);
    console.log(`Approved Driver zoneIds: ${JSON.stringify(approvedPartner.zoneIds)}`);

    // Verify database directly
    const dbDoc = await FoodDeliveryPartner.findById(partner._id).lean();
    console.log('\n--- Verification Assertions ---');
    console.log(`Database status: ${dbDoc.status} (Expected: approved)`);
    console.log(`Database zoneIds count: ${dbDoc.zoneIds.length} (Expected: 1)`);
    console.log(`Database zoneId value: ${dbDoc.zoneIds[0]} (Expected: ${testZone._id})`);

    if (dbDoc.status !== 'approved') {
        throw new Error('Assertion Failed: Driver status is not approved');
    }
    if (dbDoc.zoneIds.length !== 1 || String(dbDoc.zoneIds[0]) !== String(testZone._id)) {
        throw new Error('Assertion Failed: Driver zoneIds is not matching test zone');
    }

    console.log('\n=== ALL DELIVERY ONBOARDING ZONE TEST ASSERTIONS PASSED ===');

    // 7. Cleanup
    console.log('Cleaning up database...');
    await FoodDeliveryPartner.deleteOne({ _id: partner._id });
    console.log('Cleaned up successfully!');

}

run().catch(err => {
    console.error('TEST FLOW ENCOUNTERED AN ERROR:', err);
    process.exit(1);
}).finally(() => {
    mongoose.disconnect();
});
