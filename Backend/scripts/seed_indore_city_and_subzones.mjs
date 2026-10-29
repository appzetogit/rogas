import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

import { polygonInside, polygonsOverlap, validPolygon } from '../src/modules/dailymealbox/zones/polygonGeo.js';

async function seed() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is missing from .env');

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);

  const AdminCity = mongoose.model('AdminCity', new mongoose.Schema({}, { strict: false }), 'admin_cities');
  const FoodZone = mongoose.model('FoodZone', new mongoose.Schema({}, { strict: false }), 'food_zones');
  const FoodDeliveryPartner = mongoose.model('FoodDeliveryPartner', new mongoose.Schema({}, { strict: false }), 'food_delivery_partners');
  const FoodRestaurant = mongoose.model('FoodRestaurant', new mongoose.Schema({}, { strict: false }), 'food_restaurants');

  // 1. Define Outer Municipal Boundary for Indore (8 points)
  const cityBoundary = [
    { latitude: 22.8000, longitude: 75.8600 },
    { latitude: 22.7850, longitude: 75.9500 },
    { latitude: 22.7200, longitude: 75.9650 },
    { latitude: 22.6600, longitude: 75.9300 },
    { latitude: 22.6450, longitude: 75.8600 },
    { latitude: 22.6600, longitude: 75.7800 },
    { latitude: 22.7250, longitude: 75.7550 },
    { latitude: 22.7850, longitude: 75.7850 },
  ];

  // 2. Sub-Zone 1: Indore East (Vijay Nagar & Palasia)
  // Latitude: 22.7120 to 22.7750 | Longitude: 75.8550 to 75.9300
  const subZone1Coords = [
    { latitude: 22.7750, longitude: 75.8550 },
    { latitude: 22.7750, longitude: 75.9300 },
    { latitude: 22.7120, longitude: 75.9300 },
    { latitude: 22.7120, longitude: 75.8550 },
  ];

  // 3. Sub-Zone 2: Indore West (Rajwada & Chandan Nagar)
  // Latitude: 22.6800 to 22.7300 | Longitude: 75.7900 to 75.8450
  // Note: 75.8450 is West of 75.8550, ensuring zero overlap with a 0.0100 degree gap!
  const subZone2Coords = [
    { latitude: 22.7300, longitude: 75.7900 },
    { latitude: 22.7300, longitude: 75.8450 },
    { latitude: 22.6800, longitude: 75.8450 },
    { latitude: 22.6800, longitude: 75.7900 },
  ];

  // Geometry Validation Checks
  console.log('\n--- Running Geometry Validations ---');
  if (!validPolygon(cityBoundary)) throw new Error('City boundary is not a valid polygon');
  if (!validPolygon(subZone1Coords)) throw new Error('Sub-Zone 1 is not a valid polygon');
  if (!validPolygon(subZone2Coords)) throw new Error('Sub-Zone 2 is not a valid polygon');

  const zone1Inside = polygonInside(subZone1Coords, cityBoundary);
  const zone2Inside = polygonInside(subZone2Coords, cityBoundary);
  const zonesOverlap = polygonsOverlap(subZone1Coords, subZone2Coords);

  console.log('✓ Sub-Zone 1 strictly inside City Boundary:', zone1Inside);
  console.log('✓ Sub-Zone 2 strictly inside City Boundary:', zone2Inside);
  console.log('✓ Sub-Zones overlap each other:', zonesOverlap);

  if (!zone1Inside || !zone2Inside) {
    throw new Error('Validation failed: One or more sub-zones extend outside the city boundary!');
  }
  if (zonesOverlap) {
    throw new Error('Validation failed: Sub-zones overlap each other!');
  }

  // 4. Upsert Sub-Zone 1 (Indore East - Vijay Nagar)
  const zone1Id = new mongoose.Types.ObjectId('69b85a63fb04545984776cdb');
  const zone1Data = {
    name: 'Indore East (Vijay Nagar & Palasia)',
    zoneName: 'Indore East (Vijay Nagar & Palasia)',
    country: 'India',
    serviceLocation: 'Indore',
    coordinates: subZone1Coords,
    isActive: true,
    unit: 'kilometer',
  };
  await mongoose.connection.db.collection('food_zones').updateOne(
    { _id: zone1Id },
    { $set: zone1Data },
    { upsert: true }
  );
  console.log('\n✓ Updated Zone 1:', zone1Id.toString(), zone1Data.name);

  // 5. Upsert Sub-Zone 2 (Indore West - Rajwada)
  const zone2Id = new mongoose.Types.ObjectId('6ae1ca0e2d3f0e43c780c36f');
  const zone2Data = {
    name: 'Indore West (Rajwada & Chandan Nagar)',
    zoneName: 'Indore West (Rajwada & Chandan Nagar)',
    country: 'India',
    serviceLocation: 'Indore',
    coordinates: subZone2Coords,
    isActive: true,
    unit: 'kilometer',
  };
  await mongoose.connection.db.collection('food_zones').updateOne(
    { _id: zone2Id },
    { $set: zone2Data },
    { upsert: true }
  );
  console.log('✓ Updated Zone 2:', zone2Id.toString(), zone2Data.name);

  // 6. Upsert City (Indore)
  const cityData = {
    name: 'Indore',
    country: 'India',
    status: 'active',
    currency: 'INR',
    defaultLanguage: 'en',
    enabledLanguages: ['en', 'hi'],
    vat: {
      foodRestaurant: 5,
      foodBasic: 0,
      delivery: 18,
      service: 18,
      tips: 0,
    },
    paymentGateways: [
      { provider: 'stripe', isActive: true, config: {} }
    ],
    boundary: cityBoundary,
    zoneIds: [zone1Id, zone2Id],
    activationChecklist: {
      hasApprovedVendor: true,
      hasApprovedDriver: true,
      hasZone: true,
      hasGateway: true,
      hasLanguage: true,
    },
  };

  const updateResult = await mongoose.connection.db.collection('admin_cities').updateOne(
    { _id: new mongoose.Types.ObjectId('6ae1b85440132ff059dcd611') },
    { $set: cityData },
    { upsert: true }
  );
  console.log('✓ Updated AdminCity (6ae1b85440132ff059dcd611):', updateResult.modifiedCount, 'matched:', updateResult.matchedCount);

  // 7. Update Demo Driver to cover both Indore sub-zones
  const driver = await FoodDeliveryPartner.findOne({ phone: /8987654321/ });
  if (driver) {
    driver.zoneIds = [zone1Id, zone2Id];
    driver.status = 'approved';
    driver.city = 'Indore';
    await driver.save();
    console.log('✓ Updated Delivery Partner (8987654321) with both sub-zones');
  }

  // 8. Update Demo Vendors
  // Test home6 (Regal Cir / Film Colony) -> Indore East
  await FoodRestaurant.updateOne(
    { _id: new mongoose.Types.ObjectId('6a4cb906c7427ab4f93b16f8') },
    { $set: { zoneId: zone1Id, city: 'Indore', status: 'approved' } }
  );

  // Chandan Nagar Vendor -> Indore West
  await FoodRestaurant.updateOne(
    { _id: new mongoose.Types.ObjectId('6a61f74827b3935c9aa52fdf') },
    { $set: { zoneId: zone2Id, city: 'Indore', status: 'approved' } }
  );

  // Other Indore vendors -> Indore East
  await FoodRestaurant.updateMany(
    { _id: { $in: ['6ac0b14b41784a3cddc539bb', '6ac5d6861022566295d0a75c', '6adc466f0f27099fa315fe92'].map(id => new mongoose.Types.ObjectId(id)) } },
    { $set: { zoneId: zone1Id, city: 'Indore', status: 'approved' } }
  );
  console.log('✓ Assigned vendors to respective Indore East and West sub-zones');

  console.log('\n=======================================');
  console.log('✅ SEEDING COMPLETE SUCCESSFULLY!');
  console.log('City: Indore, India (Status: active, Currency: INR, 8-pt boundary)');
  console.log('Sub-Zone 1:', zone1Data.name, `(${zone1Id})`);
  console.log('Sub-Zone 2:', zone2Data.name, `(${zone2Id})`);
  console.log('Overlap check: ZERO OVERLAP (0.0100 degree gap between zones)');
  console.log('Containment check: 100% INSIDE CITY BOUNDARY');
  console.log('=======================================\n');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
