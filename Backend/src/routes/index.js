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
import orderUserRoutes from '../modules/food/orders/routes/order.routes.user.js';
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
import officeRoutes from '../modules/dailymealbox/office/routes/office.routes.js';
import officeAuthRoutes from '../modules/dailymealbox/office/routes/officeAuth.routes.js';

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
router.use('/v1/food/user', authMiddleware, requireRoles('USER', 'EMPLOYEE'), userRoutes);
router.use('/v1/food/notifications', authMiddleware, requireRoles('USER', 'RESTAURANT', 'DELIVERY_PARTNER'), notificationRoutes);
router.use('/v1/food/orders', authMiddleware, requireRoles('USER', 'EMPLOYEE'), orderUserRoutes);
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
// DMB Office routes
router.use('/v1/dmb/office/auth', officeAuthRoutes);
router.use('/v1/dmb/office', officeRoutes);

// ─── Development Helper Routes ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {


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
