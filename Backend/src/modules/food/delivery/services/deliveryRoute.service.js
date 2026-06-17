/**
 * deliveryRoute.service.js
 *
 * Core VRP route generation service for the Delivery Partner module.
 * Zero changes to existing delivery, order, or zone functionality.
 *
 * Flow:
 *  1. Load partner → find their assigned zone (zoneIds[0])
 *  2. Fetch active orders dispatched to this partner (or ready in their zone)
 *  3. Populate vendor lat/lng from FoodRestaurant and customer lat/lng from deliveryAddress
 *  4. Build a Haversine distance matrix
 *  5. Run cheapest-insertion VRP solver
 *  6. Upsert FoodDeliveryRoute for the partner
 *  7. Return the saved route document
 */

import mongoose from 'mongoose';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { FoodDeliveryRoute } from '../models/deliveryRoute.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import { DMBDailyOrder } from '../../../dailymealbox/subscription/dmb.dailyOrder.model.js';
import { buildHaversineMatrix, solveVRP } from './vrpSolver.js';
import { ValidationError } from '../../../../core/auth/errors.js';

// Default vehicle capacity (max items on vehicle at once). Effectively unlimited
// for food orders since each order is 1 unit and we rarely have >50 orders per shift.
const DEFAULT_VEHICLE_CAPACITY = 50;

/**
 * ACTIVE order statuses that indicate the order needs pickup or delivery.
 * We exclude 'delivered', 'cancelled_*' as they are terminal states.
 */
const ACTIVE_ORDER_STATUSES = [
    'created',
    'confirmed',
    'preparing',
    'ready_for_pickup',
    'reached_pickup',
    'picked_up',
    'reached_drop'
];

/**
 * Fetch and build the optimized route for a given delivery partner.
 *
 * @param {string} partnerId - MongoDB ObjectId of the delivery partner
 * @param {object} [coords] - Optional live coordinates { lat, lng } of the partner
 * @returns {Promise<object>} - The saved FoodDeliveryRoute document
 */
export async function buildRouteForPartner(partnerId, coords = null) {
    if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
        throw new ValidationError('Invalid partner ID');
    }

    // 1. Load partner and get their assigned zone
    const partner = await FoodDeliveryPartner.findById(partnerId).lean();
    if (!partner) {
        throw new ValidationError('Delivery partner not found');
    }

    const zoneId = partner.zoneIds?.[0] || null;

    // 2. Fetch active orders and vendors in the partner's assigned zone
    let allOrders = [];
    let zoneName = '';

    if (zoneId) {
        const zone = await FoodZone.findById(zoneId).select('name zoneName').lean();
        zoneName = zone?.name || zone?.zoneName || '';

        // Find all restaurants in this zone
        const restaurants = await FoodRestaurant.find({ zoneId: new mongoose.Types.ObjectId(zoneId) }).lean();
        const restaurantIds = restaurants.map(r => r._id);

        // Fetch active food orders in the zone or from zone's restaurants
        const foodOrders = await FoodOrder.find({
            $or: [
                { zoneId: new mongoose.Types.ObjectId(zoneId) },
                { restaurantId: { $in: restaurantIds } }
            ],
            orderStatus: { $in: ACTIVE_ORDER_STATUSES }
        })
        .populate('restaurantId', 'restaurantName location city area ownerPhone')
        .lean();

        // Fetch active DMB subscription orders from zone's restaurants
        const ACTIVE_DMB_STATUSES = ['scheduled', 'preparing', 'ready', 'out_for_delivery'];
        const dmbOrders = await DMBDailyOrder.find({
            vendorId: { $in: restaurantIds },
            status: { $in: ACTIVE_DMB_STATUSES }
        })
        .populate('vendorId', 'restaurantName location city area ownerPhone')
        .populate('userId', 'name phone')
        .lean();

        // Normalize FoodOrders
        const normalizedFood = foodOrders.map(order => {
            const r = order.restaurantId;
            return {
                _id: order._id,
                isDmb: false,
                status: order.orderStatus,
                restaurantId: r?._id,
                vendorLat: r?.location?.latitude || (r?.location?.coordinates?.[1]) || null,
                vendorLng: r?.location?.longitude || (r?.location?.coordinates?.[0]) || null,
                customerLat: order.deliveryAddress?.location?.latitude || (order.deliveryAddress?.location?.coordinates?.[1]) || null,
                customerLng: order.deliveryAddress?.location?.longitude || (order.deliveryAddress?.location?.coordinates?.[0]) || null,
                restaurantName: r?.restaurantName || 'Vendor',
                restaurantAddress: [
                    r?.location?.addressLine1 || r?.location?.address || '',
                    r?.location?.area || r?.area || '',
                    r?.location?.city || r?.city || ''
                ].filter(Boolean).join(', '),
                restaurantPhone: r?.ownerPhone || '',
                customerName: order.customerName || order.deliveryAddress?.fullName || order.deliveryAddress?.name || order.userId?.name || 'Customer',
                customerAddress: [
                    order.deliveryAddress?.street || '',
                    order.deliveryAddress?.city || '',
                    order.deliveryAddress?.state || ''
                ].filter(Boolean).join(', '),
                customerPhone: order.customerPhone || order.deliveryAddress?.phone || order.userId?.phone || ''
            };
        });

        // Normalize DMBDailyOrders
        const normalizedDmb = dmbOrders.map(order => {
            const v = order.vendorId;
            return {
                _id: order._id,
                isDmb: true,
                status: order.status,
                restaurantId: v?._id,
                vendorLat: v?.location?.latitude || (v?.location?.coordinates?.[1]) || null,
                vendorLng: v?.location?.longitude || (v?.location?.coordinates?.[0]) || null,
                customerLat: order.deliveryAddress?.location?.latitude || (order.deliveryAddress?.location?.coordinates?.[1]) || null,
                customerLng: order.deliveryAddress?.location?.longitude || (order.deliveryAddress?.location?.coordinates?.[0]) || null,
                restaurantName: v?.restaurantName || 'Vendor',
                restaurantAddress: [
                    v?.location?.addressLine1 || v?.location?.address || '',
                    v?.location?.area || v?.area || '',
                    v?.location?.city || v?.city || ''
                ].filter(Boolean).join(', '),
                restaurantPhone: v?.ownerPhone || v?.phone || '',
                customerName: order.deliveryAddress?.fullName || order.deliveryAddress?.name || order.userId?.name || 'Customer',
                customerAddress: [
                    order.deliveryAddress?.street || '',
                    order.deliveryAddress?.city || '',
                    order.deliveryAddress?.state || ''
                ].filter(Boolean).join(', '),
                customerPhone: order.deliveryAddress?.phone || order.userId?.phone || ''
            };
        });

        allOrders = [...normalizedFood, ...normalizedDmb];
    } else {
        // Fallback for partner with no zone assigned: fetch orders assigned to partner
        const foodOrders = await FoodOrder.find({
            'dispatch.deliveryPartnerId': new mongoose.Types.ObjectId(partnerId),
            orderStatus: { $in: ACTIVE_ORDER_STATUSES }
        })
        .populate('restaurantId', 'restaurantName location city area ownerPhone')
        .lean();

        allOrders = foodOrders.map(order => {
            const r = order.restaurantId;
            return {
                _id: order._id,
                isDmb: false,
                status: order.orderStatus,
                restaurantId: r?._id,
                vendorLat: r?.location?.latitude || (r?.location?.coordinates?.[1]) || null,
                vendorLng: r?.location?.longitude || (r?.location?.coordinates?.[0]) || null,
                customerLat: order.deliveryAddress?.location?.latitude || (order.deliveryAddress?.location?.coordinates?.[1]) || null,
                customerLng: order.deliveryAddress?.location?.longitude || (order.deliveryAddress?.location?.coordinates?.[0]) || null,
                restaurantName: r?.restaurantName || 'Vendor',
                restaurantAddress: [
                    r?.location?.addressLine1 || r?.location?.address || '',
                    r?.location?.area || r?.area || '',
                    r?.location?.city || r?.city || ''
                ].filter(Boolean).join(', '),
                restaurantPhone: r?.ownerPhone || '',
                customerName: order.customerName || order.deliveryAddress?.fullName || order.deliveryAddress?.name || order.userId?.name || 'Customer',
                customerAddress: [
                    order.deliveryAddress?.street || '',
                    order.deliveryAddress?.city || '',
                    order.deliveryAddress?.state || ''
                ].filter(Boolean).join(', '),
                customerPhone: order.customerPhone || order.deliveryAddress?.phone || order.userId?.phone || ''
            };
        });
    }

    // If no orders, clear the route and return empty
    if (!allOrders || allOrders.length === 0) {
        const emptyRoute = await FoodDeliveryRoute.findOneAndUpdate(
            { deliveryPartnerId: new mongoose.Types.ObjectId(partnerId) },
            {
                $set: {
                    deliveryPartnerId: new mongoose.Types.ObjectId(partnerId),
                    zoneId: zoneId || null,
                    zoneName,
                    stops: [],
                    totalDistanceMeters: 0,
                    totalStops: 0,
                    totalOrders: 0,
                    generatedAt: new Date(),
                    routeStatus: 'idle'
                }
            },
            { upsert: true, new: true }
        ).lean();
        return emptyRoute;
    }

    const isAlreadyPickedUp = (ord) => {
        const status = String(ord.status || '').toLowerCase();
        return status === 'picked_up' || status === 'reached_drop' || status === 'out_for_delivery';
    };

    // 3. Build depot + stops array, pairs, and demands for VRP
    // Depot = rider's current coordinates, or last location in partner profile, or fallback to first vendor's location
    let depotLat = 0;
    let depotLng = 0;

    const parsedLat = parseFloat(coords?.lat || coords?.latitude);
    const parsedLng = parseFloat(coords?.lng || coords?.longitude);

    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
        depotLat = parsedLat;
        depotLng = parsedLng;
    } else if (partner.lastLat != null && partner.lastLng != null) {
        depotLat = partner.lastLat;
        depotLng = partner.lastLng;
    } else if (partner.lastLocation?.coordinates?.length === 2) {
        depotLat = partner.lastLocation.coordinates[1];
        depotLng = partner.lastLocation.coordinates[0];
    } else {
        const firstOrder = allOrders[0];
        depotLat = firstOrder.vendorLat || 0;
        depotLng = firstOrder.vendorLng || 0;
    }

    const nodes = [{ lat: depotLat, lng: depotLng, type: 'depot' }];
    const demands = [0]; // depot demand = 0
    const pairs = []; // [pickupIdx, deliveryIdx] per order
    const orderMeta = [null]; // meta per node, index 0 = depot

    for (const order of allOrders) {
        const vendorLat = order.vendorLat;
        const vendorLng = order.vendorLng;
        const customerLat = order.customerLat;
        const customerLng = order.customerLng;

        // Skip orders with missing coordinates (can't route them)
        if (vendorLat == null || vendorLng == null || customerLat == null || customerLng == null) {
            console.warn(
                `[VRP] Skipping order ${order._id} — missing coordinates`,
                { vendorLat, vendorLng, customerLat, customerLng }
            );
            continue;
        }

        const isPickedUp = isAlreadyPickedUp(order);
        let pickupIdx = 0; // if already picked up, pickup node is depot (index 0)

        if (!isPickedUp) {
            // Find or create pickup node (uniquely identified by restaurantId or location)
            pickupIdx = nodes.findIndex((n, idx) => 
                n.type === 'pickup' && 
                (order.restaurantId && orderMeta[idx]?.restaurantId 
                    ? orderMeta[idx].restaurantId.toString() === order.restaurantId.toString()
                    : n.lat === vendorLat && n.lng === vendorLng)
            );
            if (pickupIdx === -1) {
                pickupIdx = nodes.length;
                nodes.push({ lat: vendorLat, lng: vendorLng, type: 'pickup' });
                demands.push(1); // +1 item picked up
                orderMeta.push({
                    orderId: order._id,
                    restaurantId: order.restaurantId,
                    isDmb: order.isDmb,
                    type: 'pickup',
                    name: order.restaurantName,
                    address: order.restaurantAddress,
                    phone: order.restaurantPhone,
                    lat: vendorLat,
                    lng: vendorLng
                });
            } else {
                demands[pickupIdx] += 1;
            }
        }

        // Find or create delivery node (uniquely identified by customer coordinates + name + phone)
        let deliveryIdx = nodes.findIndex((n, idx) => 
            n.type === 'delivery' && 
            n.lat === customerLat && 
            n.lng === customerLng &&
            orderMeta[idx]?.name === order.customerName &&
            orderMeta[idx]?.phone === order.customerPhone
        );
        if (deliveryIdx === -1) {
            deliveryIdx = nodes.length;
            nodes.push({ lat: customerLat, lng: customerLng, type: 'delivery' });
            demands.push(-1); // -1 item delivered
            orderMeta.push({
                orderId: order._id,
                isDmb: order.isDmb,
                type: 'delivery',
                name: order.customerName,
                address: order.customerAddress,
                phone: order.customerPhone,
                lat: customerLat,
                lng: customerLng
            });
        } else {
            demands[deliveryIdx] -= 1;
        }

        pairs.push([pickupIdx, deliveryIdx]);
    }

    // If all orders were skipped due to missing coords, return empty route
    if (pairs.length === 0) {
        const emptyRoute = await FoodDeliveryRoute.findOneAndUpdate(
            { deliveryPartnerId: new mongoose.Types.ObjectId(partnerId) },
            {
                $set: {
                    deliveryPartnerId: new mongoose.Types.ObjectId(partnerId),
                    zoneId: zoneId || null,
                    zoneName,
                    stops: [],
                    totalDistanceMeters: 0,
                    totalStops: 0,
                    totalOrders: 0,
                    generatedAt: new Date(),
                    routeStatus: 'idle'
                }
            },
            { upsert: true, new: true }
        ).lean();
        return emptyRoute;
    }

    // 5. Build Haversine distance matrix
    const distanceMatrix = buildHaversineMatrix(nodes);

    // 6. Run VRP solver
    const { route: routeIndices, totalDistance } = solveVRP({
        distanceMatrix,
        demands,
        pairs,
        vehicleCapacity: DEFAULT_VEHICLE_CAPACITY,
        depotIndex: 0
    });

    // 7. Map unique route indices (skip depot at index 0) to stop documents
    const seen = new Set();
    const uniqueRouteIndices = routeIndices.filter((idx) => {
        if (idx === 0) return false;
        if (seen.has(idx)) return false;
        seen.add(idx);
        return true;
    });

    const stops = uniqueRouteIndices.map((idx, position) => ({
        stopIndex: position + 1,
        type: orderMeta[idx].type,
        orderId: orderMeta[idx].orderId,
        name: orderMeta[idx].name,
        address: orderMeta[idx].address,
        lat: orderMeta[idx].lat,
        lng: orderMeta[idx].lng,
        phone: orderMeta[idx].phone,
        status: 'pending'
    }));

    // 8. Upsert the route document
    const savedRoute = await FoodDeliveryRoute.findOneAndUpdate(
        { deliveryPartnerId: new mongoose.Types.ObjectId(partnerId) },
        {
            $set: {
                deliveryPartnerId: new mongoose.Types.ObjectId(partnerId),
                zoneId: zoneId || null,
                zoneName,
                stops,
                totalDistanceMeters: Math.round(totalDistance),
                totalStops: stops.length,
                totalOrders: pairs.length,
                generatedAt: new Date(),
                routeStatus: stops.length > 0 ? 'active' : 'idle'
            }
        },
        { upsert: true, new: true }
    ).lean();

    return savedRoute;
}

/**
 * Get the current stored route for a delivery partner.
 * Does NOT recalculate — returns the last computed route.
 *
 * @param {string} partnerId
 * @returns {Promise<object|null>}
 */
export async function getPartnerRoute(partnerId) {
    if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
        throw new ValidationError('Invalid partner ID');
    }
    return FoodDeliveryRoute.findOne({
        deliveryPartnerId: new mongoose.Types.ObjectId(partnerId)
    }).lean();
}
