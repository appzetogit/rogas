import { getIO } from '../../../config/socket.js';
import { getRedis } from '../../../config/redis.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { FoodOrder } from '../../food/orders/models/order.model.js';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { logger } from '../../../utils/logger.js';

const DRIVER_LOCATION_TTL = 30; // Redis TTL in seconds (5s emit, 30s TTL)
const GPS_ARRIVING_SOON_THRESHOLD = 500; // meters

/**
 * GPS Tracking Service — Real-time driver location management
 * 
 * Socket.IO Rooms:
 *   order_tracking_{orderId}  — Customer receives driver location + ETA
 *   driver_{driverId}         — Driver emits GPS (every 5s when online)
 *   admin_{city}              — Admin sees all online drivers
 *   vendor_{vendorId}         — Vendor sees assigned driver status
 * 
 * PRD Reference: CA-14 (Live Tracking), DA-03 (GPS stream), AP-02 (Live Map), ACM-23/24
 */

// ─── Handle Driver Location Update (from driver app, every 5s) ─────────────
export const handleDriverLocationUpdate = async ({ driverId, lat, lng, timestamp }) => {
    const redis = getRedis();
    const io = getIO();

    if (!io) return;

    // 1. Store latest driver location in Redis
    const locationData = { lat, lng, timestamp: timestamp || Date.now(), driverId };
    if (redis) {
        await redis.setex(
            `driver:${driverId}:location`,
            DRIVER_LOCATION_TTL,
            JSON.stringify(locationData)
        );
    }

    // 2. Update driver's last location in DB (every 10s — throttle DB writes)
    await FoodDeliveryPartner.findByIdAndUpdate(driverId, {
        'lastLocation.coordinates': [lng, lat],
        lastLat: lat,
        lastLng: lng,
        lastLocationAt: new Date(timestamp)
    });

    // 3. Get driver's active orders to broadcast to customer rooms
    const activeOrders = await FoodOrder.find({
        'dispatch.deliveryPartnerId': driverId,
        orderStatus: { $in: ['picked_up', 'reached_drop'] }
    }).select('_id userId deliveryAddress');

    for (const order of activeOrders) {
        // Emit to customer tracking room
        io.to(`order_tracking_${order._id}`).emit('driver_location_update', {
            lat, lng,
            timestamp,
            orderId: order._id
        });

        // Check "arriving soon" trigger (< 500m from customer)
        if (order.deliveryAddress?.location?.coordinates) {
            const [destLng, destLat] = order.deliveryAddress.location.coordinates;
            const distance = haversineDistance(lat, lng, destLat, destLng);

            if (distance < GPS_ARRIVING_SOON_THRESHOLD) {
                await triggerArrivingSoon(order, driverId, distance, io);
            }
        }
    }

    // 3b. Get driver's active DailyMealBox orders to broadcast to customer rooms
    try {
        const activeDmbOrders = await DMBDailyOrder.find({
            'dispatch.deliveryPartnerId': driverId,
            status: { $in: ['picked_up'] }
        }).select('_id userId deliveryAddress');

        for (const order of activeDmbOrders) {
            // Emit to customer DMB tracking room
            io.to(`order_tracking_${order._id}`).emit('driver_location_update', {
                lat,
                lng,
                timestamp,
                orderId: order._id
            });

            // Emit to standard tracking room for client map compatibility
            io.to(`tracking:${order._id}`).emit('location-update', {
                orderId: order._id,
                deliveryPartnerId: driverId,
                lat,
                lng,
                heading: 0,
                timestamp
            });
        }
    } catch (err) {
        logger.error(`Error broadcasting DailyMealBox driver location: ${err.message}`);
    }

    // 4. Get driver city for admin broadcast
    const driver = await FoodDeliveryPartner.findById(driverId).select('city name availabilityStatus');
    if (driver?.city) {
        // Broadcast to admin city room
        io.to(`admin_${driver.city.toLowerCase()}`).emit('driver_location_update', {
            driverId,
            driverName: driver.name,
            lat, lng,
            timestamp,
            status: driver.availabilityStatus,
            activeOrders: activeOrders.length
        });
    }
};

// ─── Trigger "Arriving Soon" Notification ─────────────────────────────────
const arrivingSoonTriggered = new Set(); // prevent duplicate triggers

const triggerArrivingSoon = async (order, driverId, distance, io) => {
    const triggerKey = `${order._id}_arriving`;
    if (arrivingSoonTriggered.has(triggerKey)) return; // already triggered
    arrivingSoonTriggered.add(triggerKey);
    setTimeout(() => arrivingSoonTriggered.delete(triggerKey), 30 * 60 * 1000); // 30min reset

    // Get delivery OTP for PIN notification
    const orderWithOtp = await FoodOrder.findById(order._id).select('+deliveryOtp');
    const pin = orderWithOtp?.deliveryOtp || '';

    const driver = await FoodDeliveryPartner.findById(driverId).select('name vehicleType vehicleName');

    // FCM push to customer
    const { sendNotificationToUser } = await import('../../../core/notifications/notification.service.js');
    await sendNotificationToUser({
        recipientId: order.userId,
        recipientType: 'customer',
        title: '🛵 Driver arriving soon!',
        body: `Your delivery is ${Math.round(distance)}m away. PIN: ${pin}`,
        data: {
            screen: 'order_tracking',
            orderId: order._id.toString(),
            pin,
            driverName: driver?.name || '',
            event: 'arriving_soon'
        }
    });

    // Notify driver that customer was notified
    io.to(`driver_${driverId}`).emit('customer_notified_arriving', {
        orderId: order._id,
        distance: Math.round(distance)
    });

    logger.info(`Arriving soon triggered for order ${order._id} — driver ${Math.round(distance)}m away`);
};

// ─── Send Admin Operations Snapshot ───────────────────────────────────────
export const sendAdminSnapshot = async (city, socketId, io) => {
    const redis = getRedis();

    // Get all online drivers for this city
    const onlineDrivers = await FoodDeliveryPartner.find({
        city: { $regex: new RegExp(city, 'i') },
        availabilityStatus: 'online'
    }).select('name vehicleType lastLat lastLng lastLocationAt availabilityStatus deliveriesToday earningsToday');

    // Get pending pickups (vendors ready, driver not collected)
    const pendingPickups = await FoodOrder.find({
        orderStatus: 'ready_for_pickup',
    }).populate('restaurantId', 'restaurantName location').limit(50);

    // Get completed deliveries today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const completedCount = await FoodOrder.countDocuments({
        orderStatus: 'delivered',
        updatedAt: { $gte: todayStart }
    });

    const snapshot = {
        drivers: onlineDrivers.map(d => ({
            driverId: d._id,
            name: d.name,
            lat: d.lastLat,
            lng: d.lastLng,
            updatedAt: d.lastLocationAt,
            status: d.availabilityStatus,
            deliveries: d.deliveriesToday
        })),
        pending_pickups: pendingPickups.map(o => ({
            orderId: o._id,
            vendorName: o.restaurantId?.restaurantName,
            lat: o.restaurantId?.location?.latitude,
            lng: o.restaurantId?.location?.longitude
        })),
        stats: {
            online: onlineDrivers.length,
            delivered_today: completedCount,
            pending_pickups: pendingPickups.length
        }
    };

    io.to(socketId).emit('operations_snapshot', snapshot);
    logger.info(`Admin snapshot sent for city ${city}`);
};

// ─── Driver Goes Online/Offline ────────────────────────────────────────────
export const driverGoOnline = async (driverId, io) => {
    await FoodDeliveryPartner.findByIdAndUpdate(driverId, {
        availabilityStatus: 'online',
        isOnline: true
    });

    const driver = await FoodDeliveryPartner.findById(driverId).select('name city zoneIds');

    // Notify admin room
    if (io && driver?.city) {
        io.to(`admin_${driver.city.toLowerCase()}`).emit('driver_status_change', {
            driverId,
            name: driver.name,
            status: 'online'
        });
    }

    // ─── NEW: Join delivery zone room so driver receives vendor status broadcasts ─
    // The driver's socket must join via client-side emit, so we emit a special event
    // asking the client to join the zone room. We store the zone room name in the response.
    if (io && driver) {
        const zoneId = driver.zoneIds?.[0] ? String(driver.zoneIds[0]) : null;
        const city = driver.city || '';
        const zoneRoom = zoneId ? `delivery_zone:${zoneId}` : (city ? `delivery_zone:${city.toLowerCase()}` : null);
        if (zoneRoom) {
            // Emit to the driver's personal room so client can join the zone room
            io.to(`delivery:${driverId.toString()}`).emit('join_zone_room', { zoneRoom });
            logger.info(`Told driver ${driverId} to join zone room: ${zoneRoom}`);
        }
    }

    logger.info(`Driver ${driverId} went online`);
};


export const driverGoOffline = async (driverId, io) => {
    const redis = getRedis();

    await FoodDeliveryPartner.findByIdAndUpdate(driverId, {
        availabilityStatus: 'offline',
        isOnline: false
    });

    // Remove from Redis
    if (redis) {
        await redis.del(`driver:${driverId}:location`);
    }

    const driver = await FoodDeliveryPartner.findById(driverId).select('name city');

    // Notify admin room
    if (io && driver?.city) {
        io.to(`admin_${driver.city.toLowerCase()}`).emit('driver_status_change', {
            driverId,
            name: driver.name,
            status: 'offline'
        });
    }

    logger.info(`Driver ${driverId} went offline`);
};

// ─── Haversine Distance ────────────────────────────────────────────────────
const haversineDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
