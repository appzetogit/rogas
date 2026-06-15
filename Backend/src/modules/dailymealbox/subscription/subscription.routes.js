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

const router = express.Router();

/**
 * DailyMealBox Subscription Routes
 * PRD Reference: CA-07, CA-12, CA-15
 */

// ─── Create Subscription ──────────────────────────────────────────────────
router.post('/', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const sub = await createSubscription({ userId: req.user._id, ...req.body });
        res.status(201).json({ success: true, subscription: sub });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Get My Subscriptions ────────────────────────────────────────────────
router.get('/my', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const subscriptions = await getUserSubscriptions(req.user._id || req.user.userId, req.query.status);
        res.json({ success: true, subscriptions });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Get Today's & Tomorrow's Meal (HomeScreen card) ─────────────────────
router.get('/today', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const data = await getTodayAndTomorrowMeals(userId);
        res.json({ success: true, ...data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Get Customer Orders List (OrdersScreen) ──────────────────────────────
// ?type=upcoming (default) | ?type=past
router.get('/my-orders', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const { type = 'upcoming' } = req.query;
        const orders = await getCustomerOrders(userId, { type });
        res.json({ success: true, orders });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Skip a Specific Daily Order ────────────────────────────────────────────────
// PATCH /dmb/subscriptions/daily-orders/:orderId/skip
router.patch('/daily-orders/:orderId/skip', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const order = await DMBDailyOrder.findOne({ _id: req.params.orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Enforce: Cannot skip today's or past orders (tomorrow onwards only)
        const todayISTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const orderDateStr = new Date(order.deliveryDate).toISOString().split('T')[0];
        if (orderDateStr <= todayISTStr) {
            return res.status(400).json({ success: false, message: "Cannot skip today's or past orders" });
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
router.patch('/daily-orders/:orderId/undo-skip', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const order = await DMBDailyOrder.findOne({ _id: req.params.orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Enforce: Cannot undo skip for today's or past orders (tomorrow onwards only)
        const todayISTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const orderDateStr = new Date(order.deliveryDate).toISOString().split('T')[0];
        if (orderDateStr <= todayISTStr) {
            return res.status(400).json({ success: false, message: "Cannot undo skip for today's or past orders" });
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
router.patch('/daily-orders/:orderId/change-meal', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const order = await DMBDailyOrder.findOne({ _id: req.params.orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Enforce: Cannot modify today's or past orders (tomorrow onwards only)
        const todayISTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const orderDateStr = new Date(order.deliveryDate).toISOString().split('T')[0];
        if (orderDateStr <= todayISTStr) {
            return res.status(400).json({ success: false, message: "Cannot modify today's or past orders" });
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
        res.json({ success: true, message: 'Meals updated successfully', order });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Skip a Delivery (PRD ACM-13) ─────────────────────────────────────────
router.patch('/:subscriptionId/skip', authMiddleware, requireRoles('USER'), async (req, res) => {
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
router.patch('/:subscriptionId/pause', authMiddleware, requireRoles('USER'), async (req, res) => {
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

// ─── Cancel Subscription (PRD ACM-15 — EU Law, always accessible) ─────────
router.patch('/:subscriptionId/cancel', authMiddleware, requireRoles('USER'), async (req, res) => {
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
router.post('/daily-orders/:orderId/rate', authMiddleware, requireRoles('USER'), async (req, res) => {
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

// ─── Create Razorpay Order for Driver Tip ────────────────────────────────────
// POST /dmb/subscriptions/daily-orders/:orderId/tip/payment-order
router.post('/daily-orders/:orderId/tip/payment-order', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const { amount } = req.body;
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

        // Create a Razorpay Order
        const amountPaise = Math.round(Number(amount) * 100);
        const currency = 'INR';
        const receipt = `tip_${order._id.toString().slice(-12)}_${Date.now()}`;

        const { createRazorpayOrder, getRazorpayKeyId, isRazorpayConfigured } = await import('../../food/orders/helpers/razorpay.helper.js');

        let rzOrder = null;
        if (isRazorpayConfigured()) {
            rzOrder = await createRazorpayOrder(amountPaise, currency, receipt);
        } else {
            // Dev mode stub
            rzOrder = { id: `rzp_tip_dev_${Math.random().toString(36).substr(2, 9)}`, amount: amountPaise, currency };
        }

        // Create a pending tip transaction record
        const { FoodDeliveryTipTransaction } = await import('./dmb.dailyOrder.model.js');
        await FoodDeliveryTipTransaction.create({
            deliveryPartnerId: driverId,
            orderId: order._id,
            orderType: 'subscription',
            amount: Number(amount),
            razorpayOrderId: rzOrder.id,
            status: 'pending'
        });

        res.json({
            success: true,
            razorpay: {
                key: getRazorpayKeyId() || 'rzp_test_dummy',
                amount: amountPaise,
                currency,
                order_id: rzOrder.id,
                name: 'Rogas Delivery Tip',
                description: `Tip for Order ${order.orderId}`
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Verify payment signature & credit driver tip ────────────────────────────
// POST /dmb/subscriptions/daily-orders/:orderId/tip/verify-payment
router.post('/daily-orders/:orderId/tip/verify-payment', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const order = await DMBDailyOrder.findOne({ _id: req.params.orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const { FoodDeliveryTipTransaction } = await import('./dmb.dailyOrder.model.js');
        const tipTx = await FoodDeliveryTipTransaction.findOne({ razorpayOrderId: razorpay_order_id });
        if (!tipTx) return res.status(404).json({ success: false, message: 'Tip transaction not found' });

        if (tipTx.status === 'completed') {
            return res.json({ success: true, message: 'Payment already verified' });
        }

        const { verifyPaymentSignature, isRazorpayConfigured } = await import('../../food/orders/helpers/razorpay.helper.js');

        let isValid = true;
        if (isRazorpayConfigured()) {
            isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
        }

        if (!isValid) {
            tipTx.status = 'failed';
            await tipTx.save();
            return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
        }

        // Complete payment
        tipTx.razorpayPaymentId = razorpay_payment_id || `rzp_pay_dev_${Math.random().toString(36).substr(2, 9)}`;
        tipTx.razorpaySignature = razorpay_signature || `rzp_sig_dev_${Math.random().toString(36).substr(2, 9)}`;
        tipTx.status = 'completed';
        await tipTx.save();

        // Add tip to order document
        order.driverTip = (order.driverTip || 0) + tipTx.amount;
        await order.save();

        res.json({ success: true, message: 'Payment verified and tip credited successfully' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

export default router;
