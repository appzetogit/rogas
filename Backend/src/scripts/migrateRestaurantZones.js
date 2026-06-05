import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { FoodRestaurant } from '../modules/food/restaurant/models/restaurant.model.js';
import { FoodZone } from '../modules/food/admin/models/zone.model.js';

// Ray-Casting algorithm to check if a point is inside a polygon
// polygon: array of {latitude, longitude}
function isPointInPolygon(latitude, longitude, polygon) {
    if (!polygon || polygon.length < 3) return false;
    
    let isInside = false;
    const x = longitude;
    const y = latitude;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].longitude;
        const yi = polygon[i].latitude;
        const xj = polygon[j].longitude;
        const yj = polygon[j].latitude;
        
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            
        if (intersect) isInside = !isInside;
    }
    
    return isInside;
}

async function runMigration() {
    console.log('--- Starting Restaurant zoneId Migration ---');
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB successfully.');

        // 1. Fetch all zones
        const zones = await FoodZone.find({ isActive: true }).lean();
        console.log(`Found ${zones.length} active zones.`);
        if (zones.length === 0) {
            console.log('No active zones found. Exiting...');
            process.exit(0);
        }

        // 2. Fetch all restaurants that have a missing zoneId
        // Also we will re-verify the ones with a zoneId to see if they are mismatched
        // But to be safe, let's first focus on the ones with missing zoneId or where we need to ensure correctness.
        // The user said: "uski jone ki filed missing ya miss match ho rhi h"
        // Let's fetch ALL restaurants and verify/update their zoneId.
        const restaurants = await FoodRestaurant.find({}).select('restaurantName city location zoneId address').lean();
        console.log(`Found ${restaurants.length} total restaurants to verify.`);

        let updatedCount = 0;
        let missingZonesCount = 0;
        let unmappedRestaurants = [];

        for (const restaurant of restaurants) {
            let matchedZoneId = null;

            // Extract Lat/Lng
            let lat = restaurant.location?.latitude;
            let lng = restaurant.location?.longitude;

            if (restaurant.location?.coordinates && restaurant.location.coordinates.length === 2) {
                lng = lng || restaurant.location.coordinates[0];
                lat = lat || restaurant.location.coordinates[1];
            }

            // A) Check Point-in-Polygon (High Accuracy)
            if (lat && lng) {
                for (const zone of zones) {
                    if (isPointInPolygon(lat, lng, zone.coordinates)) {
                        matchedZoneId = zone._id.toString();
                        break;
                    }
                }
            }

            // B) Fallback to City Name matching
            if (!matchedZoneId && restaurant.city) {
                const restCity = restaurant.city.toLowerCase().trim();
                for (const zone of zones) {
                    const zoneName = (zone.name || '').toLowerCase().trim();
                    const serviceLoc = (zone.serviceLocation || '').toLowerCase().trim();
                    if (restCity === zoneName || restCity === serviceLoc) {
                        matchedZoneId = zone._id.toString();
                        break;
                    }
                }
            }

            // Now check if it needs updating
            const currentZoneId = restaurant.zoneId ? restaurant.zoneId.toString() : null;

            if (matchedZoneId) {
                if (currentZoneId !== matchedZoneId) {
                    // Update required (either was missing, or mismatched)
                    await FoodRestaurant.updateOne(
                        { _id: restaurant._id },
                        { $set: { zoneId: matchedZoneId } }
                    );
                    updatedCount++;
                }
            } else {
                // No zone matched
                missingZonesCount++;
                unmappedRestaurants.push({
                    name: restaurant.restaurantName,
                    city: restaurant.city || 'No City',
                    address: restaurant.address || restaurant.location?.formattedAddress || 'No Address'
                });
            }
        }

        console.log('\n--- Migration Summary ---');
        console.log(`Total Restaurants Checked: ${restaurants.length}`);
        console.log(`Successfully Fixed/Updated zoneId: ${updatedCount}`);
        
        if (unmappedRestaurants.length > 0) {
            console.log(`\nRestaurants without a matching Admin Zone: ${missingZonesCount}`);
            unmappedRestaurants.forEach((r, idx) => {
                console.log(`  ${idx + 1}. ${r.name} - City: ${r.city} - Address: ${r.address}`);
            });
            console.log('\n(Please create zones for the cities/areas listed above to map them)');
        } else {
            console.log('All restaurants are now mapped to a valid zoneId!');
        }

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
        process.exit(0);
    }
}

runMigration();
