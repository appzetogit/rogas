import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { updateRestaurantProfile } from '../src/modules/food/restaurant/services/restaurant.service.js';
import { getPendingRestaurants, approveRestaurant, rejectRestaurant } from '../src/modules/food/admin/services/admin.service.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
    console.log('Connecting to database...');
    await mongoose.connect(mongoUri);
    console.log('Connected!');

    // 1. Setup Test Zones
    console.log('\n--- Setting up test zones ---');
    let zoneA = await FoodZone.findOne({ name: 'Test Zone A' });
    if (!zoneA) {
        zoneA = await FoodZone.create({
            name: 'Test Zone A',
            zoneName: 'Test Zone A',
            country: 'Poland',
            coordinates: [
                { longitude: 20, latitude: 50 },
                { longitude: 22, latitude: 50 },
                { longitude: 22, latitude: 53 },
                { longitude: 20, latitude: 53 }
            ],
            isActive: true
        });
    }
    let zoneB = await FoodZone.findOne({ name: 'Test Zone B' });
    if (!zoneB) {
        zoneB = await FoodZone.create({
            name: 'Test Zone B',
            zoneName: 'Test Zone B',
            country: 'Poland',
            coordinates: [
                { longitude: 10, latitude: 40 },
                { longitude: 12, latitude: 40 },
                { longitude: 12, latitude: 43 },
                { longitude: 10, latitude: 43 }
            ],
            isActive: true
        });
    }
    console.log(`Zone A: ${zoneA._id}, Zone B: ${zoneB._id}`);

    // Clean up any old test restaurant
    await FoodRestaurant.deleteMany({ ownerPhone: '9999999999' });

    // 2. Create an Approved Vendor
    console.log('\n--- Creating an Approved Vendor ---');
    const restaurant = await FoodRestaurant.create({
        restaurantName: 'Test Zone Flow Restaurant',
        restaurantNameNormalized: 'test zone flow restaurant',
        ownerName: 'John Doe',
        ownerPhone: '9999999999',
        ownerPhoneDigits: '9999999999',
        ownerPhoneLast10: '9999999999',
        pureVegRestaurant: false,
        status: 'approved',
        zoneId: zoneA._id,
        location: {
            type: 'Point',
            coordinates: [21.0122, 52.2297],
            latitude: 52.2297,
            longitude: 21.0122,
            address: 'Warsaw, Poland',
            formattedAddress: 'Warsaw, Poland',
            city: 'Warsaw'
        }
    });
    console.log(`Created restaurant: ${restaurant.restaurantName} with ID: ${restaurant._id}`);
    console.log(`Initial Status: ${restaurant.status}, Zone: ${restaurant.zoneId}`);

    // 3. Initiate a Zone Update Request
    console.log('\n--- Simulating Zone Update Request from Vendor ---');
    const updateBody = {
        zoneId: zoneB._id.toString(),
        location: {
            latitude: 41.5,
            longitude: 11.5,
            address: 'New Location, Poland',
            formattedAddress: 'New Location, Poland',
            city: 'New City'
        }
    };

    const updatedProfile = await updateRestaurantProfile(restaurant._id, updateBody);
    console.log('Update profile response:');
    console.log(` - Returned Status: ${updatedProfile.status}`);
    console.log(` - Returned ZoneId: ${updatedProfile.zoneId} (Should still be ${zoneA._id})`);
    console.log(` - Returned pendingZoneId: ${updatedProfile.pendingZoneId} (Should be ${zoneB._id})`);
    console.log(` - Returned zoneChangeStatus: ${updatedProfile.zoneChangeStatus} (Should be "pending")`);

    // Fetch directly from DB to verify persistence details
    const dbDocAfterUpdate = await FoodRestaurant.findById(restaurant._id).lean();
    console.log('Document in Database:');
    console.log(` - status: ${dbDocAfterUpdate.status} (Should be "approved")`);
    console.log(` - zoneId: ${dbDocAfterUpdate.zoneId} (Should be ${zoneA._id})`);
    console.log(` - zoneChangeStatus: ${dbDocAfterUpdate.zoneChangeStatus} (Should be "pending")`);
    console.log(` - pendingZoneId: ${dbDocAfterUpdate.pendingZoneId} (Should be ${zoneB._id})`);
    console.log(` - pendingLocation coordinates: ${JSON.stringify(dbDocAfterUpdate.pendingLocation?.coordinates)}`);

    if (dbDocAfterUpdate.status !== 'approved') {
        throw new Error('TEST FAILED: Overall status was changed from approved to pending!');
    }
    if (dbDocAfterUpdate.zoneChangeStatus !== 'pending') {
        throw new Error('TEST FAILED: zoneChangeStatus is not pending!');
    }

    // 4. Retrieve Pending Requests (Admin View)
    console.log('\n--- Admin checking Pending Requests ---');
    const pendingList = await getPendingRestaurants();
    const matchedPending = pendingList.find(p => p._id.toString() === restaurant._id.toString());
    if (!matchedPending) {
        throw new Error('TEST FAILED: Restaurant not found in pending admin list!');
    }
    console.log('Found in pending requests list:');
    console.log(` - status: ${matchedPending.status} (Mapped to "pending" for admin UI display)`);
    console.log(` - pendingUpdateReason: ${matchedPending.pendingUpdateReason} (Should be "Zone Change Request")`);
    console.log(` - zone: ${matchedPending.zone} (Should show name of pending zone: "Test Zone B")`);
    console.log(` - city: ${matchedPending.city} (Should show pending city: "New City")`);

    // 5. Simulate Admin Rejection
    console.log('\n--- Admin Rejects Zone Change Request ---');
    const rejectedDoc = await rejectRestaurant(restaurant._id, 'Invalid zone chosen');
    console.log('Document in Database after rejection:');
    console.log(` - status: ${rejectedDoc.status} (Should still be "approved")`);
    console.log(` - zoneId: ${rejectedDoc.zoneId} (Should still be active zone ${zoneA._id})`);
    console.log(` - zoneChangeStatus: ${rejectedDoc.zoneChangeStatus} (Should be "rejected")`);
    console.log(` - zoneChangeRejectionReason: ${rejectedDoc.zoneChangeRejectionReason} (Should match reason)`);
    console.log(` - pendingZoneId: ${rejectedDoc.pendingZoneId} (Should be null/cleared)`);

    if (rejectedDoc.status !== 'approved' || rejectedDoc.zoneId.toString() !== zoneA._id.toString() || rejectedDoc.zoneChangeStatus !== 'rejected') {
        throw new Error('TEST FAILED: Rejection not applied correctly!');
    }

    // 6. Resubmit Zone Change
    console.log('\n--- Resubmitting Zone Change Request ---');
    await updateRestaurantProfile(restaurant._id, updateBody);

    // 7. Simulate Admin Approval
    console.log('\n--- Admin Approves Zone Change Request ---');
    const approvedDoc = await approveRestaurant(restaurant._id);
    console.log('Document in Database after approval:');
    console.log(` - status: ${approvedDoc.status} (Should remain "approved")`);
    console.log(` - zoneId: ${approvedDoc.zoneId} (Should update to ${zoneB._id})`);
    console.log(` - zoneChangeStatus: ${approvedDoc.zoneChangeStatus} (Should be "approved")`);
    console.log(` - location coordinates: ${JSON.stringify(approvedDoc.location?.coordinates)} (Should be updated)`);
    console.log(` - pendingZoneId: ${approvedDoc.pendingZoneId} (Should be null)`);

    if (approvedDoc.status !== 'approved' || approvedDoc.zoneId.toString() !== zoneB._id.toString() || approvedDoc.zoneChangeStatus !== 'approved') {
        throw new Error('TEST FAILED: Approval not applied correctly!');
    }

    // Cleanup
    console.log('\nCleaning up database records...');
    await FoodRestaurant.findByIdAndDelete(restaurant._id);
    console.log('Cleaned up!');
    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY ===');
}

run().catch(err => {
    console.error('TEST FLOW ENCOUNTERED AN ERROR:', err);
    process.exit(1);
}).finally(() => {
    mongoose.disconnect();
});
