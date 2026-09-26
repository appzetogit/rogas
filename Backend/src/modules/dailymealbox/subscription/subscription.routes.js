import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { getIO } from '../../../config/socket.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import {
    createSubscription,
    activateSubscription,
    skipDelivery,
    pauseSubscription,
    resumeSubscription,
    cancelSubscription,
    getUserSubscriptions
} from './subscription.service.js';
import {
    getTodayAndTomorrowMeals,
    getCustomerOrders
} from './dmb.dailyOrder.service.js';
import { DMBDailyOrder } from './dmb.dailyOrder.model.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { listSlots } from '../deliverySlot/deliverySlot.service.js';
import { VendorTimingSettings } from '../../food/admin/models/vendorTimingSettings.model.js';

const router = express.Router();

/**
 * DailyMealBox Subscription Routes
 * PRD Reference: CA-07, CA-12, CA-15
 */

// ─── Create Subscription ──────────────────────────────────────────────────
router.post('/', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const sub = await createSubscription({ userId: req.user._id, ...req.body });
        res.status(201).json({ success: true, subscription: sub });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Get My Subscriptions ────────────────────────────────────────────────
router.get('/my', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const subscriptions = await getUserSubscriptions(req.user._id || req.user.userId, req.query.status);
        res.json({ success: true, subscriptions });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Get Any User's Subscriptions (Admin Only) ───────────────────────────
router.get('/admin/user/:userId', authMiddleware, requireRoles('ADMIN'), async (req, res) => {
    try {
        const subscriptions = await getUserSubscriptions(req.params.userId, req.query.status);
        res.json({ success: true, subscriptions });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Get Today's & Tomorrow's Meal (HomeScreen card) ─────────────────────
router.get('/today', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const data = await getTodayAndTomorrowMeals(userId);
        res.json({ success: true, ...data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Get Customer Orders List (OrdersScreen) ──────────────────────────────
// ?type=upcoming (default) | ?type=past | ?date=YYYY-MM-DD
router.get('/my-orders', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const { type = 'upcoming', date, page, limit } = req.query;
        const result = await getCustomerOrders(userId, { type, date, page, limit });
        if (result.pagination) {
            res.json({ success: true, orders: result.orders, pagination: result.pagination });
        } else {
            res.json({ success: true, orders: result });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Skip a Specific Daily Order ────────────────────────────────────────────────
// PATCH /dmb/subscriptions/daily-orders/:orderId/skip
router.patch('/daily-orders/:orderId/skip', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const order = await DMBDailyOrder.findOne({ _id: req.params.orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Enforce: Cannot skip today's or past orders
        const todayISTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const orderDateStr = new Date(order.deliveryDate).toISOString().split('T')[0];
        if (orderDateStr <= todayISTStr) {
            return res.status(400).json({ success: false, message: "Cannot skip today's or past orders" });
        }

        // Cutoff time check for tomorrow's orders
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowISTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(tomorrowDate);

        if (orderDateStr === tomorrowISTStr) {
            const settings = await VendorTimingSettings.findOne({ isActive: true }).lean();
            const cutoffTime = settings?.mealChangeCutoffTime || '20:00';
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            const currentISTTime = formatter.format(now);
            
            if (currentISTTime >= cutoffTime) {
                const [h, m] = cutoffTime.split(':');
                const h12 = parseInt(h, 10) % 12 || 12;
                const ampm = parseInt(h, 10) >= 12 ? 'PM' : 'AM';
                const formattedCutoff = `${h12}:${m} ${ampm}`;
                return res.status(400).json({ success: false, message: `Cannot skip tomorrow's meal after ${formattedCutoff}` });
            }
        }

        // Per-slot cutoff configured by admin (hours before the slot's start time)
        const slotDef = (await listSlots()).find(sl => sl.key === order.deliverySlot);
        if (slotDef?.orderCutoffHours > 0 && slotDef.startTime) {
            const deadline = new Date(`${orderDateStr}T${slotDef.startTime}:00+05:30`).getTime() - slotDef.orderCutoffHours * 3600 * 1000;
            if (Date.now() >= deadline) {
                return res.status(400).json({ success: false, message: `Cannot skip ${slotDef.name} meals within ${slotDef.orderCutoffHours} hour(s) of the slot start` });
            }
        }

        if (order.status !== 'scheduled') {
            return res.status(400).json({ success: false, message: `Cannot skip order in status: ${order.status}` });
        }
        order.status = 'skipped';
        await order.save();

        // Broadcast skip update via socket
        const io = getIO();
        if (io) {
            const payload = {
                orderId: order.orderId,
                _id: order._id,
                status: order.status,
                deliveryDate: order.deliveryDate,
                deliverySlot: order.deliverySlot,
                updatedAt: new Date().toISOString()
            };
            io.to(`sub_${order.subscriptionId}`).emit('order_status_updated', payload);
            io.to(`vendor_${order.vendorId}`).emit('order_status_update', payload);
        }

        res.json({ success: true, message: 'Order skipped successfully', order });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Undo Skip for a Specific Daily Order ─────────────────────────────────────────
// PATCH /dmb/subscriptions/daily-orders/:orderId/undo-skip
router.patch('/daily-orders/:orderId/undo-skip', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const order = await DMBDailyOrder.findOne({ _id: req.params.orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Enforce: Cannot undo skip for today's or past orders
        const todayISTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const orderDateStr = new Date(order.deliveryDate).toISOString().split('T')[0];
        if (orderDateStr <= todayISTStr) {
            return res.status(400).json({ success: false, message: "Cannot undo skip for today's or past orders" });
        }

        // Cutoff time check for tomorrow's orders
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowISTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(tomorrowDate);

        if (orderDateStr === tomorrowISTStr) {
            const settings = await VendorTimingSettings.findOne({ isActive: true }).lean();
            const cutoffTime = settings?.mealChangeCutoffTime || '20:00';
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            const currentISTTime = formatter.format(now);
            
            if (currentISTTime >= cutoffTime) {
                const [h, m] = cutoffTime.split(':');
                const h12 = parseInt(h, 10) % 12 || 12;
                const ampm = parseInt(h, 10) >= 12 ? 'PM' : 'AM';
                const formattedCutoff = `${h12}:${m} ${ampm}`;
                return res.status(400).json({ success: false, message: `Cannot undo skip for tomorrow's meal after ${formattedCutoff}` });
            }
        }

        if (order.status !== 'skipped') {
            return res.status(400).json({ success: false, message: `Cannot undo skip for order in status: ${order.status}` });
        }
        order.status = 'scheduled';
        await order.save();

        // Broadcast undo skip update via socket
        const io = getIO();
        if (io) {
            const payload = {
                orderId: order.orderId,
                _id: order._id,
                status: order.status,
                deliveryDate: order.deliveryDate,
                deliverySlot: order.deliverySlot,
                updatedAt: new Date().toISOString()
            };
            io.to(`sub_${order.subscriptionId}`).emit('order_status_updated', payload);
            io.to(`vendor_${order.vendorId}`).emit('order_status_update', payload);
        }

        res.json({ success: true, message: 'Order skip undone successfully', order });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Change Meal for a Daily Order (before preparation starts) ───────────────────
// PATCH /dmb/subscriptions/daily-orders/:orderId/change-meal
// Body: { mealPlanIds: ['id1', 'id2'] }
router.patch('/daily-orders/:orderId/change-meal', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const order = await DMBDailyOrder.findOne({ _id: req.params.orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Enforce: Cannot modify today's or past orders
        const todayISTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const orderDateStr = new Date(order.deliveryDate).toISOString().split('T')[0];
        if (orderDateStr <= todayISTStr) {
            return res.status(400).json({ success: false, message: "Cannot modify today's or past orders" });
        }

        // Cutoff time check for tomorrow's orders
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowISTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(tomorrowDate);

        if (orderDateStr === tomorrowISTStr) {
            const settings = await VendorTimingSettings.findOne({ isActive: true }).lean();
            const cutoffTime = settings?.mealChangeCutoffTime || '20:00';
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            const currentISTTime = formatter.format(now);
            
            if (currentISTTime >= cutoffTime) {
                const [h, m] = cutoffTime.split(':');
                const h12 = parseInt(h, 10) % 12 || 12;
                const ampm = parseInt(h, 10) >= 12 ? 'PM' : 'AM';
                const formattedCutoff = `${h12}:${m} ${ampm}`;
                return res.status(400).json({ success: false, message: `Cannot modify tomorrow's meal after ${formattedCutoff}` });
            }
        }

        if (!['scheduled'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Can only change meal before preparation starts' });
        }
        const { mealPlanIds } = req.body;
        if (!mealPlanIds || !Array.isArray(mealPlanIds) || mealPlanIds.length === 0) {
            return res.status(400).json({ success: false, message: 'mealPlanIds array is required' });
        }
        // Fetch meal details
        const plans = await DMBMealPlan.find({ _id: { $in: mealPlanIds }, status: 'active' }).lean();
        if (plans.length === 0) return res.status(400).json({ success: false, message: 'No valid meal plans found' });
        order.meals = plans.map(p => ({ mealPlanId: p._id, name: p.name, quantity: 1 }));
        await order.save();

        // Broadcast order update via socket
        const io = getIO();
        if (io) {
            const payload = {
                orderId: order.orderId,
                _id: order._id,
                status: order.status,
                deliveryDate: order.deliveryDate,
                deliverySlot: order.deliverySlot,
                meals: order.meals.map(m => {
                    const plan = plans.find(p => String(p._id) === String(m.mealPlanId));
                    return {
                        name: m.name,
                        mealPlanName: m.name,
                        quantity: m.quantity,
                        photo: m.customPhoto || plan?.photos?.[0] || null,
                        nutrition: m.customNutrition || plan?.nutrition || null,
                        description: m.customDescription || plan?.description || ''
                    };
                }),
                updatedAt: new Date().toISOString()
            };
            io.to(`sub_${order.subscriptionId}`).emit('order_status_updated', payload);
            io.to(`vendor_${order.vendorId}`).emit('order_status_update', payload);
        }

        res.json({ success: true, message: 'Meals updated successfully', order });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Skip a Delivery (PRD ACM-13) ─────────────────────────────────────────
router.patch('/:subscriptionId/skip', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const result = await skipDelivery({
            subscriptionId: req.params.subscriptionId,
            userId: req.user._id || req.user.userId,
            skipDate: req.body.skipDate,
            reason: req.body.reason
        });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Pause Subscription (PRD ACM-14) ──────────────────────────────────────
router.patch('/:subscriptionId/pause', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const result = await pauseSubscription({
            subscriptionId: req.params.subscriptionId,
            userId: req.user._id || req.user.userId,
            pauseDays: req.body.pauseDays || 1,
            reason: req.body.reason
        });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Resume Subscription ───────────────────────────────────────────────────
router.patch('/:subscriptionId/resume', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const sub = await resumeSubscription(req.params.subscriptionId);
        if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found or not paused' });
        res.json({ success: true, message: 'Subscription resumed successfully', subscription: sub });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Cancel Subscription (PRD ACM-15 — EU Law, always accessible) ─────────
router.patch('/:subscriptionId/cancel', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const sub = await cancelSubscription({
            subscriptionId: req.params.subscriptionId,
            userId: req.user._id || req.user.userId,
            reason: req.body.reason
        });
        res.json({ success: true, message: 'Subscription cancelled', subscription: sub });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Activate After Payment ────────────────────────────────────────────────
router.patch('/:subscriptionId/activate', authMiddleware, async (req, res) => {
    try {
        const sub = await activateSubscription(req.params.subscriptionId);
        res.json({ success: true, subscription: sub });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Duration Plans CRUD (Admin & Public) ───────────────────────────────────

// Public: Get all active vendor subscription plans
router.get('/plans', async (req, res) => {
    try {
        const { VendorSubscriptionPlan } = await import('./vendorSubscriptionPlan.model.js');
        const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
        const list = await VendorSubscriptionPlan.find({ status: 'active' }).sort({ createdAt: -1 });
        
        const settings = await DeliveryOrderFeeSettings.findOne({ isActive: true });
        const feePerOrder = settings ? (settings.feePerOrder || 0) : 0;
        
        res.json({ success: true, plans: list, feePerOrder });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// Public: Get all active durations
router.get('/durations', async (req, res) => {
    try {
        const { DMBDurationPlan } = await import('./durationPlan.model.js');
        const list = await DMBDurationPlan.find({ isActive: true }).sort({ daysCountMonFri: 1 });
        res.json({ success: true, durations: list });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// Admin: Get all (including inactive)
router.get('/admin/durations', authMiddleware, requireRoles('ADMIN'), async (req, res) => {
    try {
        const { DMBDurationPlan } = await import('./durationPlan.model.js');
        const list = await DMBDurationPlan.find({}).sort({ daysCountMonFri: 1 });
        res.json({ success: true, durations: list });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// Admin: Create new duration plan
router.post('/durations', authMiddleware, requireRoles('ADMIN'), async (req, res) => {
    try {
        const { DMBDurationPlan } = await import('./durationPlan.model.js');
        const plan = await DMBDurationPlan.create(req.body);
        res.status(201).json({ success: true, duration: plan });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// Admin: Update existing
router.put('/durations/:id', authMiddleware, requireRoles('ADMIN'), async (req, res) => {
    try {
        const { DMBDurationPlan } = await import('./durationPlan.model.js');
        const plan = await DMBDurationPlan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!plan) return res.status(404).json({ success: false, message: 'Duration plan not found' });
        res.json({ success: true, duration: plan });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// Admin: Delete
router.delete('/durations/:id', authMiddleware, requireRoles('ADMIN'), async (req, res) => {
    try {
        const { DMBDurationPlan } = await import('./durationPlan.model.js');
        const plan = await DMBDurationPlan.findByIdAndDelete(req.params.id);
        if (!plan) return res.status(404).json({ success: false, message: 'Duration plan not found' });
        res.json({ success: true, message: 'Duration plan deleted successfully' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Rate a Delivered Order ──────────────────────────────────────────────────
// POST /dmb/subscriptions/daily-orders/:orderId/rate
router.post('/daily-orders/:orderId/rate', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const order = await DMBDailyOrder.findOne({ _id: req.params.orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (order.status !== 'delivered') {
            return res.status(400).json({ success: false, message: 'Can only rate delivered orders' });
        }
        if (order.isRated) {
            return res.status(400).json({ success: false, message: 'Order has already been rated' });
        }

        const { rating, comment, tipAmount } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
        }

        order.deliveryRating = rating;
        order.ratingFeedback = comment || '';
        order.driverTip = Math.max(0, Number(tipAmount) || 0);
        order.isRated = true;
        await order.save();

        // Update delivery partner's aggregate rating if assigned
        if (order.dispatch?.deliveryPartnerId) {
            try {
                const { default: mongoose } = await import('mongoose');
                const FoodDeliveryPartner = mongoose.model('FoodDeliveryPartner');
                const partner = await FoodDeliveryPartner.findById(order.dispatch.deliveryPartnerId);
                if (partner) {
                    const totalRatings = (partner.totalRatings || 0) + 1;
                    const currentTotal = (partner.rating || 0) * (partner.totalRatings || 0);
                    partner.rating = (currentTotal + rating) / totalRatings;
                    partner.totalRatings = totalRatings;
                    await partner.save();
                }
            } catch (partnerErr) {
                console.error('Failed to update delivery partner rating:', partnerErr);
                // Non-critical — don't fail the request
            }
        }

        res.json({ success: true, message: 'Rating submitted successfully' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Start a payment for a driver tip ────────────────────────────────────────
// POST /dmb/subscriptions/daily-orders/:orderId/tip/payment-order
// Body: { amount, provider?, returnPath?, cancelPath?, language? }
router.post('/daily-orders/:orderId/tip/payment-order', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const { amount, provider, returnPath, cancelPath, language } = req.body;
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid tip amount' });
        }

        const order = await DMBDailyOrder.findOne({ _id: req.params.orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.status !== 'delivered') {
            return res.status(400).json({ success: false, message: 'Can only tip after successful delivery' });
        }

        // Check if delivery partner is assigned
        const driverId = order.dispatch?.deliveryPartnerId;
        if (!driverId) {
            return res.status(400).json({ success: false, message: 'No delivery partner assigned to this order' });
        }

        const { FoodDeliveryTipTransaction } = await import('./dmb.dailyOrder.model.js');
        const { DMBSubscription } = await import('./subscription.model.js');
        const { FoodUser } = await import('../../../core/users/user.model.js');
        const { startPayment, PaymentsError } = await import('../../payments/payments.service.js');
        const { resolvePaymentContext } = await import('../../payments/payments.settings.js');

        const [sub, user] = await Promise.all([
            DMBSubscription.findById(order.subscriptionId).select('zoneId').lean(),
            FoodUser.findById(userId).select('name email phone countryCode').lean()
        ]);
        const ctx = await resolvePaymentContext({ zoneId: sub?.zoneId, dialCode: user?.countryCode });

        // The pending tip record needs a unique provider order id; it is replaced by the real one right after the payment starts.
        const tipTx = await FoodDeliveryTipTransaction.create({
            deliveryPartnerId: driverId,
            orderId: order._id,
            orderType: 'subscription',
            amount: Number(amount),
            razorpayOrderId: `pending_${order._id}_${Date.now()}`,
            status: 'pending'
        });

        try {
            const { payment } = await startPayment({
                purpose: 'tip',
                ownerType: 'user',
                ownerId: userId,
                amount: Number(amount),
                currency: ctx.currency,
                country: ctx.country,
                provider,
                description: `Tip for order ${order.orderId}`,
                customer: { name: user?.name, email: user?.email, phone: user?.phone },
                language,
                returnPath: returnPath || '/user/orders',
                cancelPath: cancelPath || '/user/orders',
                refs: { tipTransactionId: String(tipTx._id), orderId: String(order._id) }
            });
            tipTx.razorpayOrderId = payment.provider === 'razorpay' ? payment.action.orderId : payment.transactionId;
            await tipTx.save();

            const body = { success: true, payment };
            if (payment.provider === 'razorpay') {
                // Shape older clients read.
                body.razorpay = { key: payment.action.key, amount: payment.action.amount, currency: payment.action.currency, order_id: payment.action.orderId, name: 'Rogas Delivery Tip', description: payment.action.description };
            }
            return res.json(body);
        } catch (err) {
            await FoodDeliveryTipTransaction.deleteOne({ _id: tipTx._id, status: 'pending' });
            if (err instanceof PaymentsError) return res.status(err.statusCode).json({ success: false, message: err.message, code: err.code });
            throw err;
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Razorpay only: the app reports a finished pop-up; verify it and credit the driver tip ───
// POST /dmb/subscriptions/daily-orders/:orderId/tip/verify-payment
router.post('/daily-orders/:orderId/tip/verify-payment', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const { razorpay_order_id, transactionId } = req.body;

        const order = await DMBDailyOrder.findOne({ _id: req.params.orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const { findOwnedTransaction, confirmRazorpayPayment, PaymentsError } = await import('../../payments/payments.service.js');
        const tx = await findOwnedTransaction({ publicId: transactionId, providerOrderId: razorpay_order_id, purpose: 'tip', ownerId: userId });
        if (!tx || String(tx.refs?.orderId) !== String(order._id)) return res.status(404).json({ success: false, message: 'Tip transaction not found' });

        try {
            const after = await confirmRazorpayPayment(tx, req.body);
            if (!['paid', 'partially_refunded', 'refunded'].includes(after.status)) {
                return res.status(400).json({ success: false, message: 'Payment is not completed yet' });
            }
        } catch (err) {
            if (err instanceof PaymentsError) return res.status(err.statusCode).json({ success: false, message: err.message });
            throw err;
        }
        res.json({ success: true, message: 'Payment verified and tip credited successfully' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

export default router;
