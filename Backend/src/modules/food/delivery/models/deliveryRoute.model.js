import mongoose from 'mongoose';

/**
 * Sub-document for a single stop in the optimized delivery route.
 * Type 'pickup' = vendor (collect items), 'delivery' = customer (drop off).
 */
const routeStopSchema = new mongoose.Schema(
    {
        stopIndex: { type: Number, required: true },
        type: {
            type: String,
            enum: ['pickup', 'delivery'],
            required: true
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodOrder',
            default: null
        },
        name: { type: String, default: '' },
        address: { type: String, default: '' },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        phone: { type: String, default: '' },
        status: {
            type: String,
            enum: ['pending', 'completed', 'skipped'],
            default: 'pending'
        },
        completedAt: { type: Date, default: null }
    },
    { _id: false }
);

/**
 * FoodDeliveryRoute — persists the current optimized VRP route for a delivery partner.
 * One document per partner (upserted on each recalculation).
 * Collection: food_delivery_routes
 */
const deliveryRouteSchema = new mongoose.Schema(
    {
        deliveryPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            required: true,
            unique: true,
            index: true
        },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone',
            default: null
        },
        zoneName: { type: String, default: '' },
        /** Ordered list of stops (pickups before their paired deliveries). */
        stops: { type: [routeStopSchema], default: [] },
        /** Total straight-line Haversine distance of the full route in meters. */
        totalDistanceMeters: { type: Number, default: 0 },
        totalStops: { type: Number, default: 0 },
        totalOrders: { type: Number, default: 0 },
        /** When this route plan was last computed. */
        generatedAt: { type: Date, default: Date.now },
        /** Overall route lifecycle status. */
        routeStatus: {
            type: String,
            enum: ['idle', 'active', 'completed'],
            default: 'idle'
        }
    },
    {
        collection: 'food_delivery_routes',
        timestamps: true
    }
);

export const FoodDeliveryRoute = mongoose.model('FoodDeliveryRoute', deliveryRouteSchema);
