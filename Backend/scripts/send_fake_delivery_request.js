import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Simple command line arguments parser
const args = {};
process.argv.forEach((val, index) => {
  if (val.startsWith('--')) {
    const key = val.slice(2);
    // Support either --key=value or --key value
    if (key.includes('=')) {
      const parts = key.split('=');
      args[parts[0]] = parts[1];
    } else {
      args[key] = process.argv[index + 1];
    }
  }
});

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '127.0.0.1';
const serverUrl = `http://${HOST}:${PORT}/api/v1/dev/fake-delivery-request`;

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected successfully.');

  const db = mongoose.connection.db;
  const driverCol = db.collection('food_delivery_partners');
  const vendorCol = db.collection('food_restaurants');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

  try {
    // 1. Resolve Driver
    let selectedDriver = null;
    const allDrivers = await driverCol.find({}).limit(20).toArray();

    // Fetch active websocket connections from the backend
    const activeDriversUrl = `http://${HOST}:${PORT}/api/v1/dev/active-drivers`;
    let activeDriverIds = [];
    try {
      const activeRes = await fetch(activeDriversUrl);
      if (activeRes.ok) {
        const activeData = await activeRes.json();
        if (activeData.success && Array.isArray(activeData.activeDriverIds)) {
          activeDriverIds = activeData.activeDriverIds;
        }
      }
    } catch (err) {
      console.log('⚠️ Note: Could not query active WebSocket sessions from local server. (Is server running?)');
    }

    if (args.driver) {
      const driverInput = args.driver.trim();
      // Try by index (1-based)
      if (!isNaN(driverInput)) {
        const idx = parseInt(driverInput) - 1;
        if (idx >= 0 && idx < allDrivers.length) {
          selectedDriver = allDrivers[idx];
        }
      }
      // Try by name regex
      if (!selectedDriver) {
        selectedDriver = await driverCol.findOne({ name: new RegExp(driverInput, 'i') });
      }
      // Try by ID
      if (!selectedDriver) {
        try {
          selectedDriver = await driverCol.findOne({ _id: new mongoose.Types.ObjectId(driverInput) });
        } catch (e) {}
      }
    }

    if (!selectedDriver) {
      if (allDrivers.length === 0) {
        console.log('❌ No delivery partners found in the database.');
        rl.close();
        await mongoose.disconnect();
        return;
      }

      console.log('\n=== Available Delivery Partners ===');
      allDrivers.forEach((driver, idx) => {
        const isConnected = activeDriverIds.includes(driver._id.toString());
        const socketStatus = isConnected ? '🟢 CONNECTED' : '🔴 DISCONNECTED';
        console.log(`[${idx + 1}] Name: ${driver.name} | ID: ${driver._id} | Status: ${driver.status} | Availability: ${driver.availabilityStatus} | Socket: ${socketStatus}`);
      });

      const driverIndexInput = await askQuestion('\nSelect a driver by number (or enter driver ID manually): ');
      if (driverIndexInput.trim() && !isNaN(driverIndexInput)) {
        const idx = parseInt(driverIndexInput) - 1;
        if (idx >= 0 && idx < allDrivers.length) {
          selectedDriver = allDrivers[idx];
        }
      }
      if (!selectedDriver) {
        try {
          const manualId = new mongoose.Types.ObjectId(driverIndexInput.trim());
          selectedDriver = await driverCol.findOne({ _id: manualId });
        } catch (e) {}
      }
    }

    if (!selectedDriver) {
      console.log('❌ Invalid selection or Driver ID.');
      rl.close();
      await mongoose.disconnect();
      return;
    }

    console.log(`\nSelected Driver: ${selectedDriver.name} (${selectedDriver._id})`);

    // Ensure driver is online and approved in DB
    if (selectedDriver.status !== 'approved' || selectedDriver.availabilityStatus !== 'online') {
      console.log(`\n⚠️  Warning: Driver is currently: Status = "${selectedDriver.status}", Availability = "${selectedDriver.availabilityStatus}"`);
      
      let autoForce = false;
      if (args.force === 'true' || args.force === 'yes' || args.force === 'y') {
        autoForce = true;
      }

      if (autoForce) {
        await driverCol.updateOne(
          { _id: selectedDriver._id },
          { $set: { status: 'approved', availabilityStatus: 'online' } }
        );
        console.log('✅ Driver status automatically updated to APPROVED and ONLINE in DB.');
      } else {
        const forceOnline = await askQuestion('Would you like to temporarily set this driver to APPROVED and ONLINE in the database now? (y/n): ');
        if (forceOnline.toLowerCase().trim() === 'y' || forceOnline.toLowerCase().trim() === 'yes') {
          await driverCol.updateOne(
            { _id: selectedDriver._id },
            { $set: { status: 'approved', availabilityStatus: 'online' } }
          );
          console.log('✅ Driver status updated to APPROVED and ONLINE in DB.');
        }
      }
    }

    // 2. Resolve Vendor
    let selectedVendor = null;
    const allVendors = await vendorCol.find({}).limit(10).toArray();

    if (args.vendor) {
      const vendorInput = args.vendor.trim();
      if (!isNaN(vendorInput)) {
        const idx = parseInt(vendorInput) - 1;
        if (idx >= 0 && idx < allVendors.length) {
          selectedVendor = allVendors[idx];
        }
      }
      if (!selectedVendor) {
        selectedVendor = await vendorCol.findOne({ restaurantName: new RegExp(vendorInput, 'i') });
      }
      if (!selectedVendor) {
        try {
          selectedVendor = await vendorCol.findOne({ _id: new mongoose.Types.ObjectId(vendorInput) });
        } catch (e) {}
      }
    }

    if (!selectedVendor && !args.vendor) {
      if (allVendors.length > 0) {
        console.log('\n=== Available Vendors ===');
        allVendors.forEach((vendor, idx) => {
          console.log(`[${idx + 1}] Name: ${vendor.restaurantName} | City: ${vendor.city} | ID: ${vendor._id}`);
        });
        console.log(`[${allVendors.length + 1}] Use a mock vendor with custom details`);

        const vendorIndexInput = await askQuestion('\nSelect a vendor by number (default: 1): ');
        const vIdx = vendorIndexInput.trim() ? parseInt(vendorIndexInput) - 1 : 0;
        if (vIdx >= 0 && vIdx < allVendors.length) {
          selectedVendor = allVendors[vIdx];
        }
      }
    }

    let vendorDetails = {};
    if (selectedVendor) {
      vendorDetails = {
        vendorId: selectedVendor._id.toString(),
        vendorName: selectedVendor.restaurantName,
        vendorLocation: selectedVendor.location || { type: 'Point', coordinates: [77.1025, 28.7041] },
        vendorPhone: selectedVendor.phone || '9999999999'
      };
    } else {
      if (args.vendor) {
        console.log('❌ Selected vendor not found, falling back to custom mock vendor details.');
      }
      console.log('\n--- Enter Custom Mock Vendor Details ---');
      const vName = args.vendorName || await askQuestion('Vendor Name (default: Mock Vendor Kitchen): ');
      const vPhone = args.vendorPhone || await askQuestion('Vendor Phone (default: 9999999999): ');
      const vLat = args.vendorLat || await askQuestion('Vendor Latitude (default: 28.7041): ');
      const vLng = args.vendorLng || await askQuestion('Vendor Longitude (default: 77.1025): ');

      vendorDetails = {
        vendorId: new mongoose.Types.ObjectId().toString(),
        vendorName: (typeof vName === 'string' ? vName.trim() : '') || 'Mock Vendor Kitchen',
        vendorLocation: {
          type: 'Point',
          coordinates: [
            (vLng && typeof vLng === 'string' && vLng.trim()) ? parseFloat(vLng) : 77.1025,
            (vLat && typeof vLat === 'string' && vLat.trim()) ? parseFloat(vLat) : 28.7041
          ]
        },
        vendorPhone: (typeof vPhone === 'string' ? vPhone.trim() : '') || '9999999999'
      };
    }

    // 3. Number of Meal Boxes
    let boxCount = 5;
    if (args.boxes) {
      boxCount = parseInt(args.boxes) || 5;
    } else {
      const boxCountInput = await askQuestion('\nEnter number of meal boxes (default: 5): ');
      boxCount = boxCountInput.trim() ? parseInt(boxCountInput) : 5;
    }

    // 4. Slot Type
    let slotType = 'lunch';
    if (args.slot) {
      slotType = args.slot.trim().toLowerCase() === 'dinner' ? 'dinner' : 'lunch';
    } else {
      const slotInput = await askQuestion('Enter slot type (lunch / dinner, default: lunch): ');
      slotType = slotInput.trim().toLowerCase() === 'dinner' ? 'dinner' : 'lunch';
    }

    // Close readline interface as we have all inputs
    rl.close();

    // 5. Build Payload
    const batchId = `BATCH-${Math.floor(1000 + Math.random() * 9000)}`;
    const payload = {
      driverId: selectedDriver._id.toString(),
      batchId,
      slotType,
      totalMealBoxCount: boxCount,
      vendorInfo: vendorDetails,
      pickupStatus: 'ready'
    };

    console.log('\nPayload to send:', JSON.stringify(payload, null, 2));

    // 6. Send POST Request to local server
    console.log(`Sending post request to ${serverUrl}...`);
    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const resData = await response.json();
      if (response.ok && resData.success) {
        console.log('\n✅ Success! Fake delivery request broadcasted to the driver successfully.');
        console.log('Server Response:', resData);
      } else {
        console.error('\n❌ Server rejected request:', resData);
      }
    } catch (err) {
      console.error('\n❌ Error sending request to backend server. Make sure node server is running!');
      console.error(err.message);
    }

  } catch (err) {
    console.error('Error during execution:', err);
    rl.close();
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB. Exiting.');
  }
}

run().catch(console.error);
