import express from 'express';
import mongoose from 'mongoose';
import authRoutes from '../core/auth/auth.routes.js';
import deliveryRoutes from '../modules/food/delivery/routes/delivery.routes.js';
import deliveryRouteRoutes from '../modules/food/delivery/routes/deliveryRoute.routes.js';
import restaurantRoutes from '../modules/food/restaurant/routes/restaurant.routes.js';
import landingRoutes from '../modules/food/landing/routes/landing.routes.js';
// Dining module removed — not part of DailyMealBox PRD
import uploadRoutes from '../modules/uploads/routes/upload.routes.js';
import restaurantAdminRoutes from '../modules/food/admin/routes/admin.routes.js';
import userRoutes from '../modules/food/user/routes/user.routes.js';
// Legacy orders routes disabled
// import orderUserRoutes from '../modules/food/orders/routes/order.routes.user.js';
import paymentRoutes from '../core/payments/payment.routes.js';
import fcmRoutes from '../core/notifications/fcm.routes.js';
import notificationRoutes from '../core/notifications/notification.routes.js';
import { authMiddleware } from '../core/auth/auth.middleware.js';
import * as businessSettingsController from '../modules/food/admin/controllers/businessSettings.controller.js';
import { requireRoles } from '../core/roles/role.middleware.js';
import { getQueuesController } from '../controllers/admin.controller.js';
import webhookRoutes from '../core/payments/routes/webhook.routes.js';
// Legacy search routes disabled
// import searchRoutes from '../modules/food/search/routes/search.routes.js';
import appConfigRoutes from '../core/appConfig/appConfig.routes.js';
import promocodeRoutes from './promocodeRoutes.js';
import { requireZone } from '../middlewares/zone.middleware.js';

// ─── DailyMealBox Modules ────────────────────────────────────────────────────
import subscriptionRoutes from '../modules/dailymealbox/subscription/subscription.routes.js';
import driverDmbRoutes from '../modules/dailymealbox/tracking/driver.routes.js';
import vendorDmbRoutes from '../modules/dailymealbox/vendor/vendor.routes.js';
import dmbPaymentRoutes from '../modules/dailymealbox/payment/dmb.payment.routes.js';

const router = express.Router();

// Apply Global Zone Interceptor (Reads X-Zone-Id from Frontend Axios)
router.use(requireZone);

router.get('/v1/health', (req, res) => {
    res.status(200).json({ status: 'UP', message: 'Server is healthy' });
});

// App Config Route
router.use('/v1/app-config', appConfigRoutes);

// Food-prefixed auth routes
router.use('/v1/food/auth', authRoutes);

// Backward-compatible auth routes
router.use('/v1/auth', authRoutes);
router.use('/v1/food/delivery/route', deliveryRouteRoutes);
router.use('/v1/food/delivery', deliveryRoutes);
router.use('/v1/food/restaurant', restaurantRoutes);
router.use('/v1/food', landingRoutes);
// Legacy search routes disabled
// router.use('/v1/food/search', searchRoutes);
router.use('/v1/food/promocodes', promocodeRoutes);
// Dining routes removed — not part of DailyMealBox PRD

router.use('/v1/uploads', uploadRoutes);

// Mark business-settings/public as truly public
router.get('/v1/food/admin/business-settings/public', businessSettingsController.getBusinessSettings);

router.use('/v1/food/admin', authMiddleware, requireRoles('ADMIN'), restaurantAdminRoutes);
router.use('/v1/food/user', authMiddleware, requireRoles('USER'), userRoutes);
router.use('/v1/food/notifications', authMiddleware, requireRoles('USER', 'RESTAURANT', 'DELIVERY_PARTNER'), notificationRoutes);
// Legacy user orders disabled
// router.use('/v1/food/orders', authMiddleware, requireRoles('USER'), orderUserRoutes);
router.use('/v1/food/payments', authMiddleware, paymentRoutes);
router.use('/v1/payments/webhook', webhookRoutes);
router.use('/v1/fcm-tokens', fcmRoutes);
router.use('/fcm-tokens', fcmRoutes);

router.get('/v1/admin/queues', authMiddleware, requireRoles('ADMIN'), getQueuesController);

// ─── DailyMealBox Routes ────────────────────────────────────────────────────
router.use('/v1/dmb/subscriptions', subscriptionRoutes);
router.use('/v1/dmb/driver', authMiddleware, driverDmbRoutes);
// Public vendor routes (menu, plans) — no auth needed for browsing
router.use('/v1/dmb/vendor', vendorDmbRoutes);
// DMB Payment routes (Razorpay)
router.use('/v1/dmb/payments', dmbPaymentRoutes);

// ─── Development Helper Routes ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
    router.post('/v1/dev/fake-delivery-request', async (req, res) => {
        try {
            const { driverId, batchId, slotType, totalMealBoxCount, vendorInfo, pickupStatus } = req.body;
            if (!driverId) {
                return res.status(400).json({ success: false, message: 'driverId is required' });
            }

            const io = (await import('../config/socket.js')).getIO();
            if (!io) {
                return res.status(500).json({ success: false, message: 'Socket.IO not initialized' });
            }

            // ─── DB Committing: Create and Save Mock CollectionBatch & DMBDailyOrders ───
            const vendorIdObj = vendorInfo?.vendorId 
                ? new mongoose.Types.ObjectId(vendorInfo.vendorId) 
                : new mongoose.Types.ObjectId('6a2441b7b7d8e8b095b62164'); // Default mock vendor

            const vendorLng = vendorInfo?.vendorLocation?.coordinates?.[0] || 77.1025;
            const vendorLat = vendorInfo?.vendorLocation?.coordinates?.[1] || 28.7041;

            const orderIds = [];
            const dailyOrdersCol = mongoose.connection.db.collection('dmb_daily_orders');
            
            // Find a user or insert dummy
            const userCol = mongoose.connection.db.collection('food_users');
            let user = await userCol.findOne({});
            if (!user) {
                const insertUser = await userCol.insertOne({
                    name: 'John Doe (Mock)',
                    phone: '9999911111',
                    status: 'approved',
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                user = { _id: insertUser.insertedId, name: 'John Doe (Mock)', phone: '9999911111' };
            }

            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            const slot = slotType || 'lunch';
            const boxCount = totalMealBoxCount || 5;

            // Generate orders
            for (let i = 0; i < boxCount; i++) {
                // Add small offset to coordinates to simulate different customer locations around the vendor
                const latOffset = (Math.random() - 0.5) * 0.03; // ~3km
                const lngOffset = (Math.random() - 0.5) * 0.03;
                const customerLng = vendorLng + lngOffset;
                const customerLat = vendorLat + latOffset;

                const orderMongoId = new mongoose.Types.ObjectId();
                const otp = String(Math.floor(1000 + Math.random() * 9000));

                const mockOrder = {
                    _id: orderMongoId,
                    orderId: `DMB-ORD-${Date.now().toString().slice(-6)}${i}`,
                    subscriptionId: new mongoose.Types.ObjectId(),
                    userId: user._id,
                    vendorId: vendorIdObj,
                    meals: [
                        {
                            mealPlanId: new mongoose.Types.ObjectId(),
                            name: `Healthy Meal ${slot === 'lunch' ? 'Lunch' : 'Dinner'} Box`,
                            quantity: 1
                        }
                    ],
                    deliveryDate: today,
                    deliverySlot: slot,
                    status: 'preparing',
                    collectionPin: '4901',
                    deliveryPin: otp,
                    pricing: {
                        totalPrice: 15,
                        currency: 'PLN'
                    },
                    deliveryAddress: {
                        street: `Mock Street No. ${i + 1}`,
                        city: 'Indore',
                        state: 'MP',
                        label: 'Home',
                        location: {
                            type: 'Point',
                            coordinates: [customerLng, customerLat]
                        }
                    },
                    dispatch: {
                        deliveryPartnerId: null
                    },
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                await dailyOrdersCol.insertOne(mockOrder);
                orderIds.push(orderMongoId);
            }

            const finalBatchId = batchId || `DMB-BATCH-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
            const batchMongoId = new mongoose.Types.ObjectId();
            const mockBatch = {
                _id: batchMongoId,
                batchId: finalBatchId,
                vendorId: vendorIdObj,
                driverId: null, // initially unassigned
                fleetPartnerId: null,
                deliveryDate: today,
                deliverySlot: slot,
                collectionPinHash: '4901', // OTP code that driver can use to pick up
                pinExpiry: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours expiry
                pinVerified: false,
                pinAttempts: 0,
                boxCount: boxCount,
                orderIds: orderIds,
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            await mongoose.connection.db.collection('dmb_collection_batches').insertOne(mockBatch);

            // Construct payload to emit
            const payload = {
                batchId: finalBatchId,
                slotType: slot,
                totalMealBoxCount: boxCount,
                vendorInfo: {
                    vendorId: vendorIdObj.toString(),
                    vendorName: vendorInfo?.vendorName || 'Mock Vendor Kitchen',
                    vendorLocation: vendorInfo?.vendorLocation || { type: 'Point', coordinates: [vendorLng, vendorLat] },
                    vendorPhone: vendorInfo?.vendorPhone || '9999999999'
                },
                pickupStatus: 'ready',

                // Backward compatibility
                vendorId: vendorIdObj.toString(),
                vendorName: vendorInfo?.vendorName || 'Mock Vendor Kitchen',
                vendorLocation: vendorInfo?.vendorLocation || { type: 'Point', coordinates: [vendorLng, vendorLat] },
                boxCount: boxCount,
                slot: slot,
                totalOrders: boxCount
            };

            const roomName = `delivery:${driverId}`;
            io.to(roomName).emit('new_delivery_request', payload);
            console.log(`[DEV-ROUTE] Saved & Emitted fake delivery request to room "${roomName}":`, payload);

            return res.json({ success: true, message: `Created database entries & emitted fake request to room: ${roomName}`, payload });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    router.get('/v1/dev/active-drivers', async (req, res) => {
        try {
            const io = (await import('../config/socket.js')).getIO();
            if (!io) {
                return res.status(500).json({ success: false, message: 'Socket.IO not initialized' });
            }

            const activeDriverIds = [];
            const sockets = await io.fetchSockets();
            for (const socket of sockets) {
                if (socket.user?.role === 'DELIVERY_PARTNER' && socket.user?.userId) {
                    activeDriverIds.push(socket.user.userId.toString());
                }
            }

            const uniqueDriverIds = [...new Set(activeDriverIds)];
            return res.json({ success: true, activeDriverIds: uniqueDriverIds });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });
}

export default router;
