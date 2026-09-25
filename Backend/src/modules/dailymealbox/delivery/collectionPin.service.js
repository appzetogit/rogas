import crypto from 'crypto';
import { getRedis } from '../../../config/redis.js';
import { CollectionBatch } from './collectionBatch.model.js';
import { FoodOrder } from '../../food/orders/models/order.model.js';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { sendNotificationToUser } from '../../../core/notifications/notification.service.js';
import { getIO } from '../../../config/socket.js';
import { logger } from '../../../utils/logger.js';
import { enqueueOrderEvent } from '../../food/orders/services/order.helpers.js';
import * as foodTransactionService from '../../food/orders/services/foodTransaction.service.js';
import { FoodTransaction } from '../../food/orders/models/foodTransaction.model.js';
import { msg } from '../../i18n/i18n.service.js';

const COLLECTION_PIN_EXPIRY_SECONDS = parseInt(process.env.COLLECTION_PIN_EXPIRY_SECONDS || '7200'); // 2 hours
const MAX_PIN_ATTEMPTS = 3;

/**
 * Collection PIN Service
 * CRITICAL: Vendor marks ready → PIN generated → Redis stored → FCM push to driver
 * PRD Reference: VM-05, DA-05, Section "Preparation Status → Collection PIN → Driver Push"
 */

// ─── Vendor Marks All Orders Ready → Generates Collection PIN ─────────────
export const markVendorReady = async ({ vendorId, deliveryDate, deliverySlot }) => {
    const redis = getRedis();

    // 1. Get all pending orders for this vendor/date/slot
    const orders = await FoodOrder.find({
        restaurantId: vendorId,
        deliveryDate: new Date(deliveryDate),
        deliverySlot,
        orderStatus: { $in: ['confirmed', 'preparing'] }
    }).populate('dispatch.deliveryPartnerId', 'name phone fcmTokens fcmTokenMobile city');

    if (orders.length === 0) {
        throw new Error('No orders found for this vendor today');
    }

    // 2. Update all orders to ready_for_pickup
    await FoodOrder.updateMany(
        {
            restaurantId: vendorId,
            deliveryDate: new Date(deliveryDate),
            deliverySlot,
            orderStatus: { $in: ['confirmed', 'preparing'] }
        },
        {
            $set: { orderStatus: 'ready_for_pickup' },
            $push: {
                statusHistory: {
                    at: new Date(),
                    byRole: 'RESTAURANT',
                    byId: vendorId,
                    from: 'preparing',
                    to: 'ready_for_pickup',
                    note: 'Vendor marked all ready'
                }
            }
        }
    );

    // 3. Group orders by assigned driver (create batches)
    const batchMap = new Map();
    for (const order of orders) {
        const driverId = order.dispatch?.deliveryPartnerId?._id?.toString() || 'unassigned';
        if (!batchMap.has(driverId)) {
            batchMap.set(driverId, { driver: order.dispatch?.deliveryPartnerId, orders: [] });
        }
        batchMap.get(driverId).orders.push(order);
    }

    const createdBatches = [];

    // 4. Generate PIN for each batch and FCM push to driver
    for (const [driverId, { driver, orders: batchOrders }] of batchMap) {
        // Generate 4-digit PIN
        const pin = String(Math.floor(1000 + crypto.randomInt(9000))).padStart(4, '0');
        const pinHash = crypto.createHash('sha256').update(pin).digest('hex');

        // Create batch document
        const batch = await CollectionBatch.create({
            vendorId,
            driverId: driverId !== 'unassigned' ? driverId : null,
            deliveryDate: new Date(deliveryDate),
            deliverySlot,
            collectionPinHash: pinHash,
            pinExpiry: new Date(Date.now() + COLLECTION_PIN_EXPIRY_SECONDS * 1000),
            boxCount: batchOrders.length,
            orderIds: batchOrders.map(o => o._id),
            status: driverId !== 'unassigned' ? 'driver_assigned' : 'pending'
        });

        // Store raw PIN in Redis (2h TTL) — driver verifies against this
        if (redis) {
            await redis.set(
                `collection_pin:${batch.batchId}`,
                pin,
                'EX',
                COLLECTION_PIN_EXPIRY_SECONDS
            );
        }

        // 5. FCM push to driver (CRITICAL — cannot be disabled per PRD)
        if (driver?.fcmTokens?.length || driver?.fcmTokenMobile?.length) {
            await sendNotificationToUser({
                recipientId: driverId,
                recipientType: 'driver',
                title: msg('Orders ready for pickup! 🟢'),
                body: msg('{{count}} boxes ready. Collection PIN: {{pin}}. Tap to navigate.', { count: batchOrders.length, pin }),
                data: {
                    screen: 'pickup_detail',
                    vendor_id: vendorId.toString(),
                    batch_id: batch.batchId,
                    collection_pin: pin,
                    box_count: batchOrders.length,
                    event: 'vendor_ready'
                },
                canDisable: false  // ops critical
            });
        }

        // 6. Emit to vendor socket room (show PIN on vendor screen)
        const io = getIO();
        if (io) {
            io.to(`vendor_${vendorId}`).emit('batch_ready', {
                batchId: batch.batchId,
                pin,
                boxCount: batchOrders.length,
                driverName: driver?.name || 'Unassigned',
                slot: deliverySlot
            });
        }

        createdBatches.push({ batchId: batch.batchId, pin, boxCount: batchOrders.length });
        logger.info(`Collection batch ${batch.batchId} created with PIN for driver ${driverId}`);
    }

    return { batches: createdBatches, totalOrders: orders.length };
};

// ─── Driver Verifies Collection PIN ───────────────────────────────────────
export const verifyCollectionPin = async ({ batchId, pinEntered, driverId, collectionGps }) => {
    const redis = getRedis();

    const batch = await CollectionBatch.findOne({ batchId });
    if (!batch) throw new Error('Batch not found');
    if (batch.pinVerified) throw new Error('PIN already verified for this batch');
    if (batch.pinAttempts >= MAX_PIN_ATTEMPTS) throw new Error('Too many incorrect attempts. Admin has been alerted.');

    // Get stored PIN from Redis
    let storedPin = null;
    if (redis) {
        storedPin = await redis.get(`collection_pin:${batchId}`);
    }

    if (!storedPin) {
        // Fallback: check if PIN expired
        if (batch.pinExpiry && new Date() > batch.pinExpiry) {
            throw new Error('Collection PIN has expired. Vendor needs to regenerate.');
        }
        throw new Error('PIN not found in cache. Contact admin.');
    }

    if (pinEntered !== storedPin) {
        batch.pinAttempts += 1;
        await batch.save();

        // Alert admin after 3 failed attempts
        if (batch.pinAttempts >= MAX_PIN_ATTEMPTS) {
            batch.pinAlertSent = true;
            await batch.save();
            logger.warn(`PIN alert: 3 failed attempts for batch ${batchId} by driver ${driverId}`);
            // TODO: notify admin via socket/notification
        }

        throw new Error(`Incorrect PIN. ${MAX_PIN_ATTEMPTS - batch.pinAttempts} attempts remaining.`);
    }

    // PIN correct — mark batch collected
    batch.pinVerified = true;
    batch.status = 'collected';
    batch.collectedAt = new Date();
    batch.collectionGps = collectionGps || {};
    await batch.save();

    // Update all orders in batch to picked_up
    await FoodOrder.updateMany(
        { _id: { $in: batch.orderIds } },
        {
            $set: {
                orderStatus: 'picked_up',
                collectionPinVerified: true,
                collectionBatchId: batchId
            },
            $push: {
                statusHistory: {
                    at: new Date(),
                    byRole: 'DELIVERY_PARTNER',
                    byId: driverId,
                    from: 'ready_for_pickup',
                    to: 'picked_up',
                    note: `Collection PIN verified for batch ${batchId}`
                }
            }
        }
    );

    // Clean up Redis PIN
    if (redis) {
        await redis.del(`collection_pin:${batchId}`);
    }

    // Notify vendor: batch collected
    await sendNotificationToUser({
        recipientId: batch.vendorId,
        recipientType: 'vendor',
        title: msg('Batch {{batchId}} collected ✓', { batchId }),
        body: msg('Driver collected {{count}} boxes at {{time}}. PIN verified.', { count: batch.boxCount, time: new Date().toLocaleTimeString() }),
        data: { screen: 'delivery_assignment', event: 'batch_collected', batchId }
    });

    // Emit to vendor socket
    const io = getIO();
    if (io) {
        io.to(`vendor_${batch.vendorId}`).emit('batch_collected', {
            batchId,
            collectedAt: batch.collectedAt,
            driverId
        });
    }

    logger.info(`Collection PIN verified for batch ${batchId} by driver ${driverId}`);
    return { success: true, boxCount: batch.boxCount, collectedAt: batch.collectedAt };
};

// ─── Verify Delivery PIN (Customer to Driver) ──────────────────────────────
export const verifyDeliveryPin = async ({ orderId, pinEntered, driverId, deliveryGps }) => {
    const redis = getRedis();
    const io = getIO();

    const redisKey = `delivery_pin:${orderId}`;
    let storedPin = null;
    if (redis) {
        storedPin = await redis.get(redisKey);
    }

    if (!storedPin) {
        // Fallback: check order's stored pin in DMBDailyOrder first, then FoodOrder
        const dmbOrder = await DMBDailyOrder.findById(orderId);
        if (dmbOrder?.deliveryPin) {
            storedPin = dmbOrder.deliveryPin;
        } else {
            const order = await FoodOrder.findById(orderId).select('+deliveryOtp');
            storedPin = order?.deliveryOtp;
        }
    }

    if (!storedPin || pinEntered !== storedPin) {
        throw new Error('Incorrect delivery PIN');
    }

    // Check GPS fraud (flag if driver > 500m from delivery address)
    const GPS_MISMATCH_THRESHOLD = parseInt(process.env.GPS_MISMATCH_THRESHOLD_METERS || '500');
    let gpsMismatch = false;

    if (deliveryGps) {
        const dmbOrder = await DMBDailyOrder.findById(orderId);
        if (dmbOrder?.deliveryAddress?.location?.coordinates) {
            const [destLng, destLat] = dmbOrder.deliveryAddress.location.coordinates;
            const distance = haversineDistance(deliveryGps.lat, deliveryGps.lng, destLat, destLng);
            if (distance > GPS_MISMATCH_THRESHOLD) {
                gpsMismatch = true;
                logger.warn(`GPS mismatch for daily order ${orderId}: driver ${distance}m from address`);
            }
        } else {
            const order = await FoodOrder.findById(orderId);
            if (order?.deliveryAddress?.location?.coordinates) {
                const [destLng, destLat] = order.deliveryAddress.location.coordinates;
                const distance = haversineDistance(deliveryGps.lat, deliveryGps.lng, destLat, destLng);
                if (distance > GPS_MISMATCH_THRESHOLD) {
                    gpsMismatch = true;
                    logger.warn(`GPS mismatch for order ${orderId}: driver ${distance}m from address`);
                }
            }
        }
    }

    // Confirm delivery
    await confirmDelivery({ orderId, driverId, method: 'pin', deliveryGps, gpsMismatch });

    // Clean up Redis
    if (redis) await redis.del(redisKey);

    return { success: true, gpsMismatch };
};

// ─── Confirm Delivery (shared for PIN + Photo) ─────────────────────────────
export const confirmDelivery = async ({ orderId, driverId, method, deliveryGps, gpsMismatch, proofPhotoUrl }) => {
    const io = getIO();

    // Check if it is a DMB Daily Order
    const isDmbOrder = await DMBDailyOrder.exists({ _id: orderId });

    let order;
    if (isDmbOrder) {
        order = await DMBDailyOrder.findByIdAndUpdate(
            orderId,
            {
                $set: {
                    status: 'delivered',
                    deliveredAt: new Date()
                }
            },
            { new: true }
        );

        if (!order) throw new Error('Daily Order not found');

        // Delivery count will be incremented upon payment confirmation
        // Notification to customer remains unchanged

        // Notify customer: delivered!
        await sendNotificationToUser({
            recipientId: order.userId,
            recipientType: 'customer',
            title: msg('Delivered! 🎉'),
            body: msg('Your DailyMealBox has been delivered. Enjoy!'),
            data: { screen: 'order_detail', orderId: order._id.toString(), event: 'delivered' }
        });

        // Emit order status to customer's tracking room
        if (io) {
            io.to(`order_tracking_${orderId}`).emit('order_status_changed', {
                orderId,
                status: 'delivered',
                deliveredAt: new Date()
            });
            // Also broadcast order_status_updated to customer's notifications/orders listener
            io.emit('order_status_updated', {
                _id: orderId,
                orderId: order.orderId,
                status: 'delivered'
            });
        }
    } else {
        const existingOrder = await FoodOrder.findById(orderId);
        if (!existingOrder) throw new Error('Order not found');

        // Fallback to legacy FoodOrder update
        order = await FoodOrder.findByIdAndUpdate(
            orderId,
            {
                $set: {
                    orderStatus: 'delivered',
                    proofMethod: method,
                    proofPhotoUrl: proofPhotoUrl || '',
                    deliveryGps,
                    gpsMismatch,
                    'deliveryState.currentPhase': 'delivered',
                    'deliveryState.deliveredAt': new Date()
                },
                $push: {
                    statusHistory: {
                        at: new Date(),
                        byRole: 'DELIVERY_PARTNER',
                        byId: driverId,
                        from: 'reached_drop',
                        to: 'delivered',
                        note: `Proof: ${method}`
                    }
                }
            },
            { new: true }
        );

        if (!order) throw new Error('Order not found');

        try {
            const tx = await FoodTransaction.findOne({ orderId: order._id }).lean();
            const prevPayStatus = String(tx?.payment?.status || order?.payment?.status || 'cod_pending');
            const payMethod = String(tx?.payment?.method || order?.payment?.method || order?.paymentMethod || 'cash');

            let finalPayMethod = payMethod;
            if (finalPayMethod === 'qr') finalPayMethod = 'razorpay_qr';

            const ledgerKind =
                finalPayMethod === 'cash'
                    ? 'cod_marked_paid_on_delivery'
                    : (finalPayMethod === 'razorpay_qr' ? 'cod_collect_qr_settled' : 'payment_snapshot_sync');

            await foodTransactionService.updateTransactionStatus(order._id, ledgerKind, {
                status: 'captured',
                paymentMethod: finalPayMethod,
                recordedByRole: 'DELIVERY_PARTNER',
                recordedById: driverId,
                note: `Rider finalized payment as ${finalPayMethod}. Order is now delivered.`,
            });

            enqueueOrderEvent('delivery_completed', {
                orderMongoId: order._id?.toString?.(),
                orderId: order.orderId || order._id.toString(),
                deliveryPartnerId: driverId,
                payMethod: finalPayMethod,
                prevPayStatus,
                paymentStatus: 'paid'
            });
        } catch (err) {
            logger.error(`Error updating financial ledger for delivered order ${orderId}: ${err.message}`);
        }

        // Delivery count will be incremented upon payment confirmation
        // Notification to customer remains unchanged

        // Notify customer: delivered!
        await sendNotificationToUser({
            recipientId: order.userId,
            recipientType: 'customer',
            title: msg('Delivered! 🎉'),
            body: msg('Your meal has been delivered. Enjoy! Rate your experience →'),
            data: { screen: 'order_detail', orderId: order._id.toString(), event: 'delivered' }
        });

        // Emit order status to customer's tracking room
        if (io) {
            io.to(`order_tracking_${orderId}`).emit('order_status_changed', {
                orderId,
                status: 'delivered',
                deliveredAt: new Date()
            });
            io.emit('order_status_updated', {
                _id: orderId,
                orderId: order.orderId,
                status: 'delivered'
            });
        }
    }

    logger.info(`Order ${orderId} delivered by driver ${driverId}`);
    return order;
};

// ─── Haversine Distance (meters) ──────────────────────────────────────────
const haversineDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const toRad = (deg) => (deg * Math.PI) / 180;
