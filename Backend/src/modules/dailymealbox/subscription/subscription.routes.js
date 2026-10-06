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
    keepSubscription,
    getUserSubscriptions
} from './subscription.service.js';
import {
    getTodayAndTomorrowMeals,
    getCustomerOrders
} from './dmb.dailyOrder.service.js';
import { DMBDailyOrder } from './dmb.dailyOrder.model.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { DMBSubscription } from './subscription.model.js';
import { refundWalletBalance, deductWalletBalance } from '../../food/user/services/userWallet.service.js';
import { listSlots } from '../deliverySlot/deliverySlot.service.js';
import { VendorTimingSettings } from '../../food/admin/models/vendorTimingSettings.model.js';

const router = express.Router();

/**
 * Whether the customer may still skip / undo / change a delivery. All times are in the platform time zone
 * (PLATFORM_TIMEZONE, default Europe/Warsaw) — this used to be hard-coded to Asia/Kolkata.
 *   - never for today or past deliveries
 *   - tomorrow's delivery: not after the admin's meal-change cut-off (Vendor Timing Settings, default 20:00)
 *   - any delivery: not within the slot's own cut-off hours before it starts
 */
const modificationBlockedReason = async (order, verb) => {
    const { localDateStr, localTimeHHMM, zonedInstant, storageDateStr, addDays, localToday } = await import('../../../utils/platformTime.js');
    const orderDateStr = storageDateStr(order.deliveryDate);
    const todayStr = localDateStr();
    if (orderDateStr <= todayStr) return verb === 'undo' ? "Cannot undo skip for today's or past orders" : verb === 'skip' ? "Cannot skip today's or past orders" : "Cannot modify today's or past orders";
    if (orderDateStr === storageDateStr(addDays(localToday(), 1))) {
        const settings = await VendorTimingSettings.findOne({ isActive: true }).lean();
        const cutoffTime = settings?.mealChangeCutoffTime || '20:00';
        if (localTimeHHMM() >= cutoffTime) {
            return verb === 'undo' ? `Cannot undo skip for tomorrow's meal after ${cutoffTime}` : verb === 'skip' ? `Cannot skip tomorrow's meal after ${cutoffTime}` : `Cannot modify tomorrow's meal after ${cutoffTime}`;
        }
    }
    const slotDef = (await listSlots()).find((sl) => sl.key === order.deliverySlot);
    if (slotDef?.orderCutoffHours > 0 && slotDef.startTime) {
        const deadline = zonedInstant(orderDateStr, slotDef.startTime).getTime() - slotDef.orderCutoffHours * 3600 * 1000;
        if (Date.now() >= deadline) return `Changes to ${slotDef.name} meals close ${slotDef.orderCutoffHours} hour(s) before the slot starts`;
    }
    return null;
};

/**
 * What the customer paid for one delivery — credited on skip, debited on undo. A company-paid (office) meal was not paid
 * by the employee, so skipping it never puts money in their own wallet.
 */
const paidForOrder = (order, sub) => {
    if (sub?.source === 'office') return 0;
    const paid = Number(order.pricing?.totalPrice) || 0;
    if (paid > 0) return paid;
    return Number(sub?.pricing?.basePricePerDay) || Number(order.pricing?.foodCost) || 0;
};

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

        const blocked = await modificationBlockedReason(order, 'skip');
        if (blocked) return res.status(400).json({ success: false, message: blocked });
        const orderDateStr = new Date(order.deliveryDate).toISOString().split('T')[0];

        // Monthly skip limit (ACM-13). Select-mode and pre-orders have no subscription to skip against.
        const subForLimit = order.subscriptionId ? await DMBSubscription.findById(order.subscriptionId).select('maxSkipsPerMonth skipsUsedThisMonth skipsMonthKey').lean() : null;
        if (!subForLimit) return res.status(400).json({ success: false, message: 'Only subscription deliveries can be skipped' });
        const { localDateStr: monthOf } = await import('../../../utils/platformTime.js');
        const monthKey = monthOf().slice(0, 7);
        const usedThisMonth = subForLimit.skipsMonthKey === monthKey ? (subForLimit.skipsUsedThisMonth || 0) : 0;
        if (usedThisMonth >= (subForLimit.maxSkipsPerMonth ?? 2)) {
            return res.status(400).json({ success: false, code: 'SKIP_LIMIT', message: `Skip limit reached: ${subForLimit.maxSkipsPerMonth ?? 2} skips per month` });
        }

        if (order.status !== 'scheduled') {
            return res.status(400).json({ success: false, message: `Cannot skip order in status: ${order.status}` });
        }
        order.status = 'skipped';
        await order.save();

        // Increment monthly skip count and credit wallet
        let creditAmount = 0;
        const sub = await DMBSubscription.findById(order.subscriptionId);
        if (sub) {
            if (sub.skipsMonthKey !== monthKey) {
                sub.skipsMonthKey = monthKey;
                sub.skipsUsedThisMonth = 0;
            }
            sub.skipsUsedThisMonth = (sub.skipsUsedThisMonth || 0) + 1;
            await sub.save();

            // One order is one slot on one day: credit exactly what was paid for it (it used to credit every slot).
            creditAmount = paidForOrder(order, sub);
            if (creditAmount > 0) {
                await refundWalletBalance(userId, creditAmount, `Meal skipped on ${orderDateStr}`, {
                    orderId: order._id,
                    subscriptionId: sub._id
                }).catch(err => console.error('Failed to credit wallet on skip:', err));
            }
        }

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

        res.json({ success: true, message: 'Order skipped successfully', order, creditAmount });
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

        const blocked = await modificationBlockedReason(order, 'undo');
        if (blocked) return res.status(400).json({ success: false, message: blocked });
        const orderDateStr = new Date(order.deliveryDate).toISOString().split('T')[0];

        if (order.status !== 'skipped') {
            return res.status(400).json({ success: false, message: `Cannot undo skip for order in status: ${order.status}` });
        }
        order.status = 'scheduled';
        await order.save();

        const sub = await DMBSubscription.findById(order.subscriptionId);
        if (sub) {
            if (sub.skipsUsedThisMonth > 0) {
                sub.skipsUsedThisMonth -= 1;
                await sub.save();
            }
            const debitAmount = paidForOrder(order, sub);
            if (debitAmount > 0) {
                await deductWalletBalance(userId, debitAmount, `Undo meal skip on ${orderDateStr}`, {
                    orderId: order._id,
                    subscriptionId: sub._id
                }).catch(err => console.error('Failed to debit wallet on undo-skip:', err));
            }
        }

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

        const blocked = await modificationBlockedReason(order, 'change');
        if (blocked) return res.status(400).json({ success: false, message: blocked });

        if (!['scheduled'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Can only change meal before preparation starts' });
        }
        const { mealPlanIds } = req.body;
        if (!mealPlanIds || !Array.isArray(mealPlanIds) || mealPlanIds.length === 0) {
            return res.status(400).json({ success: false, message: 'mealPlanIds array is required' });
        }
        // Only the maker delivering this order (also on a Smart Rotation day: swap within the same maker, Gap AK).
        const plans = await DMBMealPlan.find({ _id: { $in: mealPlanIds }, status: 'active', vendorId: order.vendorId }).lean();
        if (plans.length === 0) return res.status(400).json({ success: false, message: 'No valid meal plans found for this maker' });
        const mapped = plans.map(p => ({ mealPlanId: p._id, name: p.name, quantity: 1, temperatureType: p.temperatureType || null }));
        if (order.isFamilyBox && req.body.memberLabel) {
            // Family Box: replace only that person's set, keep everyone else's.
            const label = String(req.body.memberLabel);
            if (!order.meals.some((m) => m.memberLabel === label)) return res.status(400).json({ success: false, message: 'Unknown family member' });
            order.meals = [...order.meals.filter((m) => m.memberLabel !== label), ...mapped.map((m) => ({ ...m, memberLabel: label }))];
        } else {
            order.meals = mapped;
        }
        order.hasColdMeal = order.meals.some((m) => m.temperatureType === 'cold');
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
        // Scoped to the caller: a customer can only resume their own subscription.
        const sub = await resumeSubscription(req.params.subscriptionId, { userId: req.user._id || req.user.userId });
        if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found or not paused' });
        res.json({ success: true, message: 'Subscription resumed successfully', subscription: sub });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Cancel Subscription (PRD ACM-15 — EU Law, always accessible) ─────────
router.patch('/:subscriptionId/cancel', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const { subscription, cancellation } = await cancelSubscription({
            subscriptionId: req.params.subscriptionId,
            userId: req.user._id || req.user.userId,
            reason: req.body.reason
        });
        res.json({
            success: true,
            message: cancellation.atPeriodEnd ? 'Subscription will end at the end of your paid period' : 'Subscription cancelled',
            subscription,
            cancellation
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Keep my subscription (undo a cancellation that has not ended the subscription yet) ───────────────
router.patch('/:subscriptionId/keep', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const sub = await keepSubscription({ subscriptionId: req.params.subscriptionId, userId: req.user._id || req.user.userId });
        res.json({ success: true, message: 'Your subscription continues', subscription: sub });
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
        // ?vendorId=X -> the plans that maker created. Without it: the old platform plans (rotation and office orders choose
        // their plan before the makers are known).
        const mongooseLib = (await import('mongoose')).default;
        const wanted = req.query.vendorId;
        const planFilter = { status: 'active', vendorId: wanted && mongooseLib.Types.ObjectId.isValid(String(wanted)) ? wanted : null };
        const all = await VendorSubscriptionPlan.find(planFilter).sort({ createdAt: -1 }).lean();
        // Annual (ACM-149), fortnightly (ACM-151) and weekend (ACM-177) plans are offered only where switched on.
        const { getControl } = await import('../platform/platformConfig.service.js');
        const ctx = { zoneId: req.query.zoneId || req.zoneId };
        const [annual, fortnight, weekend] = await Promise.all([getControl('annualPlan', ctx), getControl('fortnightlyPlan', ctx), getControl('weekendDelivery', ctx)]);
        const list = all.filter((p) => (p.duration !== 'year' || annual.enabled)
            && (p.duration !== 'fortnight' || fortnight.enabled)
            && (p.deliveryDays !== 'full_week' || (weekend.saturday && weekend.sunday)));

        const { deliveryFeeForZone } = await import('../platform/zoneFee.js');
        const { fee: feePerOrder } = await deliveryFeeForZone(ctx.zoneId);

        res.json({ success: true, plans: list, feePerOrder, annualDiscountPct: annual.enabled ? annual.discountPct : 0 });
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

// ─── Rate a Delivered Order (Gap R: meal / delivery / overall) ───────────────────
// POST /dmb/subscriptions/daily-orders/:orderId/rate
// Body: { mealQuality?, deliveryExperience?, overall?, comment?, tipAmount? }  (legacy: { rating, comment })
router.post('/daily-orders/:orderId/rate', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const { rateOrder } = await import('../ratings/ratings.service.js');
        const order = await rateOrder({ userId: req.user._id || req.user.userId, orderId: req.params.orderId, body: req.body || {} });
        res.json({ success: true, message: 'Rating submitted successfully', ratings: order.ratings });
    } catch (err) {
        res.status(err.statusCode || 400).json({ success: false, code: err.code, message: err.message });
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
