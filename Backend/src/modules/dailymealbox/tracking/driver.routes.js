import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { markVendorReady, verifyCollectionPin, verifyDeliveryPin } from '../delivery/collectionPin.service.js';
import { handleDriverLocationUpdate, driverGoOnline, driverGoOffline } from '../tracking/tracking.service.js';
import { getIO } from '../../../config/socket.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { FoodOrder } from '../../food/orders/models/order.model.js';
import { CollectionBatch } from '../delivery/collectionBatch.model.js';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { notifyDriverOfRouteUpdate } from '../subscription/dmb.dailyOrder.service.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * DailyMealBox Driver Routes
 * PRD Reference: DA-03 to DA-09
 */

// ─── Go Online ────────────────────────────────────────────────────────────
router.patch('/go-online', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const io = getIO();
        await driverGoOnline((req.user.userId || req.user._id), io);
        res.json({ success: true, message: 'You are now online' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Go Offline ────────────────────────────────────────────────────────────
router.patch('/go-offline', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const io = getIO();
        await driverGoOffline((req.user.userId || req.user._id), io);
        res.json({ success: true, message: 'You are now offline' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Update GPS Location (every 5s from driver app) ───────────────────────
router.post('/location', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { lat, lng } = req.body;
        if (lat === undefined || lng === undefined) {
            return res.status(400).json({ success: false, message: 'lat and lng required' });
        }
        // Non-blocking — don't await to keep response fast
        handleDriverLocationUpdate({ driverId: (req.user.userId || req.user._id), lat, lng, timestamp: Date.now() });
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Get Today's Route ────────────────────────────────────────────────────
router.get('/my-route', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // Fetch active collection batches for this driver
        const { CollectionBatch } = await import('../delivery/collectionBatch.model.js');
        const batches = await CollectionBatch.find({
            driverId: (req.user.userId || req.user._id),
            status: { $in: ['driver_assigned', 'driver_en_route', 'collected'] }
        }).populate('vendorId', 'restaurantName location addressLine1 phone').sort({ createdAt: -1 });

        let batch = null;
        let orders = [];

        for (const candidate of batches) {
            const candidateOrders = await DMBDailyOrder.find({
                _id: { $in: candidate.orderIds }
            })
                .populate('vendorId', 'restaurantName location addressLine1 phone')
                .populate('userId', 'name phone')
                .sort({ deliverySlot: 1 });

            const isCompleted = candidateOrders.length > 0 && candidateOrders.every(o => ['delivered', 'skipped', 'failed'].includes(o.status));
            if (!isCompleted) {
                batch = candidate;
                orders = candidateOrders;
                break;
            }
        }

        if (!batch) {
            return res.json({ success: true, stops: [], orders: [], totalBoxes: 0 });
        }


        // Fetch dynamic delivery fee configured by Admin
        let riderEarningSetting = 0;
        try {
            const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
            const feeConfig = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
            if (feeConfig && Number(feeConfig.feePerOrder) > 0) {
                riderEarningSetting = Number(feeConfig.feePerOrder);
            }
        } catch (err) {
            console.error("Failed to fetch DeliveryOrderFeeSettings in /my-route", err);
        }

        // Generate delivery Pin/OTP mapping if needed
        const batchOtpMap = new Map();
        if (batch.orderIds && batch.collectionPinHash) {
            for (const oId of batch.orderIds) {
                batchOtpMap.set(oId.toString(), batch.collectionPinHash);
            }
        }

        const ordersWithPins = [];
        for (const order of orders) {
            const orderObj = order.toObject();
            orderObj.pin = batchOtpMap.get(order._id.toString()) || '4901';
            
            // Assign Admin-configured delivery fee to riderEarning
            orderObj.riderEarning = orderObj.riderEarning || riderEarningSetting;

            if (!orderObj.deliveryPin) {
                const randomPin = String(Math.floor(1000 + Math.random() * 9000));
                orderObj.deliveryPin = randomPin;
                // Save it asynchronously in the database
                DMBDailyOrder.updateOne({ _id: order._id }, { $set: { deliveryPin: randomPin } })
                    .catch(err => console.error(`Error background updating deliveryPin: ${err.message}`));
            }
            ordersWithPins.push(orderObj);
        }

        const vendorName = batch.vendorId?.restaurantName || 'Vendor';
        const vendorAddress = batch.vendorId?.addressLine1 || 'Vendor Address';
        const vendorPhone = batch.vendorId?.phone || '';
        const vendorLocation = batch.vendorId?.location || null;
        const slotType = batch.deliverySlot ? (batch.deliverySlot.charAt(0).toUpperCase() + batch.deliverySlot.slice(1)) : 'Slot';
        const totalMealBoxCount = batch.boxCount || 0;
        const stopsCount = orders.length;

        // Delivery timer: 3 hours countdown from collectedAt (when vendor pickup is verified)
        const deliveryDeadline = batch.collectedAt 
            ? new Date(batch.collectedAt.getTime() + 3 * 60 * 60 * 1000).toISOString()
            : null;

        // Build stops sequence
        let stops = [];
        if (batch.status !== 'collected') {
            // Not collected yet: first stop is the Pickup at vendor
            const vendorLat = batch.vendorId?.location?.latitude || (batch.vendorId?.location?.coordinates && batch.vendorId.location.coordinates[1]);
            const vendorLng = batch.vendorId?.location?.longitude || (batch.vendorId?.location?.coordinates && batch.vendorId.location.coordinates[0]);
            
            stops = [
                {
                    id: 'pickup_' + batch._id,
                    type: 'P',
                    name: vendorName,
                    address: vendorAddress,
                    status: 'READY',
                    orderId: orders[0]?._id,
                    vendorLat,
                    vendorLng
                },
                ...ordersWithPins.map((order, idx) => ({
                    id: 'delivery_' + order._id,
                    type: 'D',
                    name: order.userId?.name || 'Customer',
                    address: order.deliveryAddress?.addressLine1 || order.deliveryAddress?.city,
                    status: 'WAITING',
                    orderId: order._id,
                    customerLat: order.deliveryAddress?.location?.latitude || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[1]),
                    customerLng: order.deliveryAddress?.location?.longitude || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[0]),
                    boxNumber: idx + 1
                }))
            ];
        } else {
            // Already collected: stops are just the customer deliveries
            // Sort so pending ones are listed first, and completed are at the end
            const sortedOrders = [...ordersWithPins].sort((a, b) => {
                const aDone = ['delivered', 'skipped', 'failed'].includes(a.status);
                const bDone = ['delivered', 'skipped', 'failed'].includes(b.status);
                if (aDone && !bDone) return 1;
                if (!aDone && bDone) return -1;
                return 0;
            });

            let firstPendingFound = false;
            stops = sortedOrders.map((order, idx) => {
                const isDone = ['delivered', 'skipped', 'failed'].includes(order.status);
                let stopStatus = 'WAITING';
                if (isDone) {
                    stopStatus = order.status === 'delivered' ? 'COMPLETED' : 'FAILED';
                } else if (!firstPendingFound) {
                    stopStatus = 'READY';
                    firstPendingFound = true;
                }

                return {
                    id: 'delivery_' + order._id,
                    type: 'D',
                    name: order.userId?.name || 'Customer',
                    address: order.deliveryAddress?.addressLine1 || order.deliveryAddress?.city,
                    status: stopStatus,
                    orderId: order._id,
                    customerLat: order.deliveryAddress?.location?.latitude || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[1]),
                    customerLng: order.deliveryAddress?.location?.longitude || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[0]),
                    boxNumber: idx + 1
                };
            });
        }

        res.json({
            success: true,
            stops,
            orders: ordersWithPins,
            totalBoxes: ordersWithPins.length,
            vendorName,
            vendorAddress,
            vendorPhone,
            vendorLocation,
            slotType,
            totalMealBoxCount,
            stopsCount,
            deliveryDeadline
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Driver Stats (today) ─────────────────────────────────────────────────
router.get('/stats', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const driver = await FoodDeliveryPartner.findById((req.user.userId || req.user._id))
            .select('earningsToday deliveriesToday cashBalance rating isOnline currentShift');
        res.json({ success: true, stats: driver });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Verify Collection PIN (at vendor) ────────────────────────────────────
router.post('/verify-collection-pin', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { pin, collectionGps } = req.body;
        const driverId = (req.user.userId || req.user._id);

        const batch = await CollectionBatch.findOne({ driverId, status: 'driver_assigned' });
        if (!batch) {
            return res.status(404).json({ success: false, message: 'No active pickup batch found' });
        }

        if (batch.collectionPinHash !== pin) {
            return res.status(400).json({ success: false, message: 'Invalid Collection PIN' });
        }

        batch.status = 'collected';
        batch.collectedAt = new Date();
        batch.collectionGps = collectionGps || {};
        await batch.save();

        // Update Daily Orders status
        await DMBDailyOrder.updateMany(
            { _id: { $in: batch.orderIds } },
            { $set: { status: 'picked_up', pickedUpAt: new Date() } }
        );

        // Notify Vendor
        const io = getIO();
        if (io) {
            io.to(`vendor_${batch.vendorId}`).emit('batch_collected_success', {
                batchId: batch.batchId,
                message: 'Driver collected the batch successfully'
            });
        }

        notifyDriverOfRouteUpdate(driverId);

        res.json({ success: true, message: 'Batch collected successfully' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Verify Delivery PIN (at customer) ────────────────────────────────────
router.post('/verify-delivery-pin', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { orderId, pin, deliveryGps } = req.body;
        const result = await verifyDeliveryPin({
            orderId,
            pinEntered: pin,
            driverId: (req.user.userId || req.user._id),
            deliveryGps
        });
        notifyDriverOfRouteUpdate((req.user.userId || req.user._id));
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Delivery Photo Upload ────────────────────────────────────────────────
router.post('/delivery-photo', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { orderId, photoUrl, deliveryGps } = req.body;
        const { confirmDelivery } = await import('../delivery/collectionPin.service.js');
        const order = await confirmDelivery({
            orderId,
            driverId: (req.user.userId || req.user._id),
            method: 'photo',
            deliveryGps,
            proofPhotoUrl: photoUrl
        });
        notifyDriverOfRouteUpdate((req.user.userId || req.user._id));
        res.json({ success: true, order });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Accept Batch (Real-time Broadcast) ───────────────────────────────────
router.post('/accept-batch', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { batchId } = req.body;
        if (!batchId) return res.status(400).json({ success: false, message: 'batchId is required' });

        const batch = await CollectionBatch.findOne({ batchId });
        if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });
        if (batch.driverId) return res.status(400).json({ success: false, message: 'Batch already assigned to another driver' });

        const driver = await FoodDeliveryPartner.findById((req.user.userId || req.user._id));
        if (!driver) return res.status(404).json({ success: false, message: 'Driver profile not found' });

        // Generate 4-digit OTP for the vendor to verify this driver
        const otp = String(Math.floor(1000 + crypto.randomInt(9000))).padStart(4, '0');

        batch.driverId = (req.user.userId || req.user._id);
        batch.status = 'driver_assigned';
        batch.assignedAt = new Date();
        // We temporarily store the raw OTP in `collectionPinHash` or a dedicated field if needed.
        // The driver will show this OTP to the vendor. We can store it directly in batch for simplicity.
        batch.collectionPinHash = otp; 
        await batch.save();

        // Update orders inside the batch (if needed, assign driverId)
        await DMBDailyOrder.updateMany(
            { _id: { $in: batch.orderIds } },
            { $set: { 'dispatch.deliveryPartnerId': (req.user.userId || req.user._id) } }
        );

        const io = getIO();
        if (io) {
            // Notify the vendor that the batch has been accepted and who the driver is
            io.to(`vendor_${batch.vendorId}`).emit('batch_accepted', {
                batchId: batch.batchId,
                driver: {
                    _id: driver._id,
                    name: driver.name,
                    phone: driver.phone,
                    vehicleNumber: driver.vehicleNumber,
                    profilePhoto: driver.profilePhoto
                },
                otp // The vendor can see this OTP or the driver tells the vendor this OTP
            });

            // Optionally, emit a broadcast to clear the modal from other drivers
            // This might require a specific namespace or a broadcast flag
            io.emit('remove_delivery_request', { batchId: batch.batchId });
        }

        notifyDriverOfRouteUpdate((req.user.userId || req.user._id));

        res.json({ 
            success: true, 
            message: 'Batch accepted successfully', 
            batch: {
                batchId: batch.batchId,
                vendorId: batch.vendorId,
                boxCount: batch.boxCount,
                otp
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Confirm Payment (QR or Cash) ──────────────────────────────────────────
router.post('/confirm-payment', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { orderId, method } = req.body;
        const driverId = req.user.userId || req.user._id;

        const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
        const { FoodOrder } = await import('../../food/orders/models/order.model.js');
        const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
        const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');

        // Check if it has already been paid/confirmed to prevent double earnings
        let order = await DMBDailyOrder.findById(orderId);
        let isFoodOrder = false;
        
        if (!order) {
            order = await FoodOrder.findById(orderId);
            isFoodOrder = true;
        }

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.paymentConfirmed) {
            return res.status(400).json({ success: false, message: 'Payment already confirmed for this order' });
        }

        // Fetch dynamic delivery fee configured by Admin
        let riderEarning = 18; // fallback default
        try {
            const orderFeeSettings = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
            if (orderFeeSettings && Number(orderFeeSettings.feePerOrder) > 0) {
                riderEarning = Number(orderFeeSettings.feePerOrder);
            }
        } catch (err) {
            console.error("Failed to fetch DeliveryOrderFeeSettings", err);
        }

        // Apply earning to driver
        await FoodDeliveryPartner.findByIdAndUpdate(driverId, {
            $inc: {
                earningsToday: riderEarning,
                deliveriesToday: 1
            }
        });

        // If Cash, update payment status so COD wallet reflects it
        if (isFoodOrder) {
            const updateDoc = { paymentConfirmed: true, riderEarning };
            if (method === 'CASH' && order.payment?.method === 'cash') {
                updateDoc['payment.status'] = 'paid';
            }
            await FoodOrder.findByIdAndUpdate(orderId, { $set: updateDoc });
        } else {
            // For DMB Orders
            await DMBDailyOrder.findByIdAndUpdate(orderId, { $set: { paymentConfirmed: true, riderEarning, paymentMethod: method } });
        }

        res.json({ success: true, riderEarning, message: 'Payment confirmed successfully' });
    } catch (err) {
        console.error("Confirm payment error:", err);
        res.status(400).json({ success: false, message: err.message });
    }
});

export default router;

