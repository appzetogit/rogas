import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
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
        const subscriptions = await getUserSubscriptions(req.user._id, req.query.status);
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
        if (order.status !== 'scheduled') {
            return res.status(400).json({ success: false, message: `Cannot skip order in status: ${order.status}` });
        }
        order.status = 'skipped';
        await order.save();
        res.json({ success: true, message: 'Order skipped successfully', order });
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
            userId: req.user._id,
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
            userId: req.user._id,
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
            userId: req.user._id,
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

export default router;
