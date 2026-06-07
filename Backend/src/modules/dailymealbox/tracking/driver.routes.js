import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { markVendorReady, verifyCollectionPin, verifyDeliveryPin } from '../delivery/collectionPin.service.js';
import { handleDriverLocationUpdate, driverGoOnline, driverGoOffline } from '../tracking/tracking.service.js';
import { getIO } from '../../../config/socket.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { FoodOrder } from '../../food/orders/models/order.model.js';

const router = express.Router();

/**
 * DailyMealBox Driver Routes
 * PRD Reference: DA-03 to DA-09
 */

// ─── Go Online ────────────────────────────────────────────────────────────
router.patch('/go-online', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const io = getIO();
        await driverGoOnline(req.user._id, io);
        res.json({ success: true, message: 'You are now online' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Go Offline ────────────────────────────────────────────────────────────
router.patch('/go-offline', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const io = getIO();
        await driverGoOffline(req.user._id, io);
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
        handleDriverLocationUpdate({ driverId: req.user._id, lat, lng, timestamp: Date.now() });
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

        const orders = await FoodOrder.find({
            'dispatch.deliveryPartnerId': req.user._id,
            orderStatus: { $in: ['confirmed', 'preparing', 'ready_for_pickup', 'picked_up', 'reached_drop'] },
            deliveryDate: { $gte: today, $lt: tomorrow }
        })
            .populate('restaurantId', 'restaurantName location addressLine1')
            .populate('userId', 'name phone')
            .sort({ deliverySlot: 1 });

        // Build stop list: pickups first, then deliveries
        const stops = orders.map((order, idx) => ({
            order: idx + 1,
            type: order.orderStatus === 'picked_up' ? 'delivery' : 'pickup',
            orderId: order._id,
            vendorName: order.restaurantId?.restaurantName,
            vendorAddress: order.restaurantId?.addressLine1,
            vendorLat: order.restaurantId?.location?.latitude,
            vendorLng: order.restaurantId?.location?.longitude,
            customerZone: order.deliveryAddress?.city,
            deliverySlot: order.deliverySlot,
            status: order.orderStatus,
            boxNumber: idx + 1
        }));

        res.json({ success: true, stops, totalBoxes: orders.length });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Driver Stats (today) ─────────────────────────────────────────────────
router.get('/stats', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const driver = await FoodDeliveryPartner.findById(req.user._id)
            .select('earningsToday deliveriesToday cashBalance rating isOnline currentShift');
        res.json({ success: true, stats: driver });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Verify Collection PIN (at vendor) ────────────────────────────────────
router.post('/verify-collection-pin', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { batchId, pin, collectionGps } = req.body;
        const result = await verifyCollectionPin({
            batchId,
            pinEntered: pin,
            driverId: req.user._id,
            collectionGps
        });
        res.json({ success: true, ...result });
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
            driverId: req.user._id,
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
            driverId: req.user._id,
            method: 'photo',
            deliveryGps,
            proofPhotoUrl: photoUrl
        });
        res.json({ success: true, order });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

export default router;
