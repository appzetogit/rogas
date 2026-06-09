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

        const orders = await DMBDailyOrder.find({
            'dispatch.deliveryPartnerId': (req.user.userId || req.user._id),
            status: { $in: ['ready', 'ready_for_pickup', 'picked_up', 'out_for_delivery'] },
            deliveryDate: { $gte: today, $lt: tomorrow }
        })
            .populate('vendorId', 'restaurantName location addressLine1')
            .populate('userId', 'name phone')
            .sort({ deliverySlot: 1 });

        // Build stop list: pickups first, then deliveries
        const stops = orders.map((order, idx) => ({
            order: idx + 1,
            type: order.status === 'out_for_delivery' || order.status === 'picked_up' ? 'delivery' : 'pickup',
            orderId: order._id,
            displayOrderId: order.orderId,
            vendorName: order.vendorId?.restaurantName,
            vendorAddress: order.vendorId?.addressLine1,
            vendorLat: order.vendorId?.location?.latitude,
            vendorLng: order.vendorId?.location?.longitude,
            customerName: order.userId?.name,
            customerPhone: order.userId?.phone,
            customerAddress: order.deliveryAddress?.addressLine1 || order.deliveryAddress?.city,
            customerLat: order.deliveryAddress?.location?.latitude,
            customerLng: order.deliveryAddress?.location?.longitude,
            customerZone: order.deliveryAddress?.city,
            deliverySlot: order.deliverySlot,
            status: order.status,
            boxNumber: idx + 1
        }));

        res.json({ success: true, stops, orders, totalBoxes: orders.length });
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

export default router;

