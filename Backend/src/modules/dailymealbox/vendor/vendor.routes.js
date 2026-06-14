import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { markVendorReady } from '../delivery/collectionPin.service.js';
import { FoodOrder } from '../../food/orders/models/order.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { DMBDailyMenu } from '../mealplan/dailyMenu.model.js';
import { DMBSubscription } from '../subscription/subscription.model.js';
import { sendNotificationToUser } from '../../../core/notifications/notification.service.js';
import { createInboxNotifications } from '../../../core/notifications/notification.service.js';
import { logger } from '../../../utils/logger.js';
import {
    getVendorDailyOrders,
    updateDailyOrderStatus,
    markAllOrdersReady
} from '../subscription/dmb.dailyOrder.service.js';

const router = express.Router();

/**
 * DailyMealBox Vendor Routes
 * PRD Reference: VM-03, VM-04, VM-05, VM-06, VM-07, VM-08
 */

// ─── Vendor Dashboard — Today Stats ──────────────────────────────────────
router.get('/today-orders', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [total, subscription, oneTime] = await Promise.all([
            FoodOrder.countDocuments({ restaurantId: vendorId, deliveryDate: { $gte: today } }),
            FoodOrder.countDocuments({ restaurantId: vendorId, deliveryDate: { $gte: today }, orderType: 'subscription' }),
            FoodOrder.countDocuments({ restaurantId: vendorId, deliveryDate: { $gte: today }, orderType: 'one_time' })
        ]);

        res.json({ success: true, stats: { total, subscription, oneTime } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Today's Orders List ──────────────────────────────────────────────────
router.get('/orders', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const { slot, type, status } = req.query;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const filter = { restaurantId: req.user.userId, deliveryDate: { $gte: today } };
        if (slot) filter.deliverySlot = slot;
        if (type) filter.orderType = type;
        if (status) filter.orderStatus = status;

        const orders = await FoodOrder.find(filter)
            .populate('userId', 'name phone')
            .sort({ deliverySlot: 1, createdAt: -1 });

        res.json({ success: true, orders });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Tomorrow's Forecast ──────────────────────────────────────────────────
router.get('/forecast', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const dayAfter = new Date(tomorrow);
        dayAfter.setDate(dayAfter.getDate() + 1);

        // Confirmed subscription orders for tomorrow
        const subscriptionOrders = await FoodOrder.find({
            restaurantId: vendorId,
            deliveryDate: { $gte: tomorrow, $lt: dayAfter },
            orderType: 'subscription'
        }).populate('mealPlanId', 'name');

        // Group by meal plan
        const forecast = {};
        for (const order of subscriptionOrders) {
            const mealName = order.mealPlanId?.name || 'Unknown Meal';
            forecast[mealName] = (forecast[mealName] || 0) + 1;
        }

        res.json({
            success: true,
            date: tomorrow.toISOString().split('T')[0],
            totalExpected: subscriptionOrders.length,
            breakdown: Object.entries(forecast).map(([meal, count]) => ({ meal, count }))
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── CRITICAL: Mark All Orders Ready → Generate Collection PINs ──────────
router.post('/mark-ready', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const { deliveryDate, deliverySlot } = req.body;
        if (!deliveryDate || !deliverySlot) {
            return res.status(400).json({ success: false, message: 'deliveryDate and deliverySlot required' });
        }

        const result = await markVendorReady({
            vendorId: req.user.userId,
            deliveryDate,
            deliverySlot
        });

        res.json({ success: true, message: 'Orders marked ready. Drivers notified.', ...result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Meal Plans CRUD ──────────────────────────────────────────────────────
router.get('/meal-plans', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const plans = await DMBMealPlan.find({ vendorId: req.user.userId }).sort({ createdAt: -1 });
        res.json({ success: true, plans });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.post('/meal-plans', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const plan = await DMBMealPlan.create({ vendorId: req.user.userId, ...req.body });
        res.status(201).json({ success: true, plan });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.put('/meal-plans/:planId', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const plan = await DMBMealPlan.findOneAndUpdate(
            { _id: req.params.planId, vendorId: req.user.userId },
            req.body,
            { new: true, runValidators: true }
        );
        if (!plan) return res.status(404).json({ success: false, message: 'Meal plan not found' });
        res.json({ success: true, plan });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Daily Menu CRUD / Schedule ───────────────────────────────────────────
router.get('/daily-menus', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { startDate, endDate } = req.query;
        const filter = { vendorId };
        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setUTCHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setUTCHours(23, 59, 59, 999);
            filter.date = { $gte: start, $lte: end };
        }
        const dailyMenus = await DMBDailyMenu.find(filter).populate('mealPlanId', 'name');
        res.json({ success: true, dailyMenus });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.post('/daily-menus', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { mealPlanId, date, dishName, description, photo, nutrition } = req.body;
        if (!mealPlanId || !date || !dishName) {
            return res.status(400).json({ success: false, message: 'mealPlanId, date, and dishName are required' });
        }

        const normalizedDate = new Date(date);
        normalizedDate.setUTCHours(0, 0, 0, 0);

        // ─── Enforce: ONE meal per vendor per day ───────────────────────
        // Delete any existing daily menu for this vendor+date with a DIFFERENT mealPlanId
        await DMBDailyMenu.deleteMany({
            vendorId,
            date: normalizedDate,
            mealPlanId: { $ne: mealPlanId }
        });

        // Find and update or create
        const dailyMenu = await DMBDailyMenu.findOneAndUpdate(
            { vendorId, mealPlanId, date: normalizedDate },
            {
                dishName,
                description: description || '',
                photo: photo || '',
                nutrition: nutrition || { calories: null, protein: null, carbs: null, fats: null }
            },
            { new: true, upsert: true, runValidators: true }
        );

        // Proactively generate/ensure daily orders exist for all active subscribers for this date first,
        // so they get this new menu customized dish immediately.
        try {
            const { generateDailyOrdersForDate } = await import('../subscription/dmb.dailyOrder.service.js');
            await generateDailyOrdersForDate(normalizedDate);
        } catch (genErr) {
            logger.warn(`Failed to proactively generate daily orders for date ${normalizedDate}: ${genErr.message}`);
        }

        // Update any scheduled daily orders for this vendor+date and emit socket events
        try {
            const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
            const { getSocketIo } = await import('../../../utils/socket.js');
            const dayStart = new Date(normalizedDate);
            dayStart.setUTCHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

            // Find ALL scheduled orders for this vendor+date (any meal plan)
            const ordersToUpdate = await DMBDailyOrder.find({
                vendorId,
                deliveryDate: { $gte: dayStart, $lt: dayEnd },
                status: 'scheduled'
            });

            const io = getSocketIo();
            for (const order of ordersToUpdate) {
                let updated = false;
                for (const m of order.meals) {
                    if (m.name !== dishName) {
                        m.name = dishName;
                        updated = true;
                    }
                }
                if (updated) {
                    await order.save();
                }
                // Emit to BOTH subscription room AND user room for guaranteed delivery
                if (io) {
                    const subRoom = `sub_${order.subscriptionId}`;
                    const userRoom = `user:${order.userId}`;
                    const payload = {
                        subscriptionId: order.subscriptionId,
                        deliveryDate: order.deliveryDate,
                        dishName,
                        vendorId: String(vendorId)
                    };
                    io.to(subRoom).emit('daily_menu_updated', payload);
                    io.to(userRoom).emit('daily_menu_updated', payload);
                    logger.info(`Socket emitted daily_menu_updated to ${subRoom} and ${userRoom} for: ${dishName}`);
                }
            }
        } catch (orderUpdateErr) {
            logger.warn(`Failed to update daily orders with new daily menu: ${orderUpdateErr.message}`);
        }

        res.json({ success: true, dailyMenu });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.delete('/daily-menus', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { mealPlanId, date } = req.query;
        if (!mealPlanId || !date) {
            return res.status(400).json({ success: false, message: 'mealPlanId and date are required' });
        }

        const normalizedDate = new Date(date);
        normalizedDate.setUTCHours(0, 0, 0, 0);

        await DMBDailyMenu.deleteOne({ vendorId, mealPlanId, date: normalizedDate });

        // Restore daily orders back to their default master plan name!
        try {
            const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
            const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
            const { getSocketIo } = await import('../../../utils/socket.js');
            
            const masterPlan = await DMBMealPlan.findById(mealPlanId);
            const defaultName = masterPlan ? masterPlan.name : 'Meal';

            const dayStart = new Date(normalizedDate);
            dayStart.setUTCHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

            const ordersToUpdate = await DMBDailyOrder.find({
                vendorId,
                deliveryDate: { $gte: dayStart, $lt: dayEnd },
                status: 'scheduled',
                'meals.mealPlanId': mealPlanId
            });

            const io = getSocketIo();
            for (const order of ordersToUpdate) {
                let updated = false;
                for (const m of order.meals) {
                    if (m.mealPlanId.toString() === mealPlanId.toString()) {
                        if (m.name !== defaultName) {
                            m.name = defaultName;
                            updated = true;
                        }
                    }
                }
                if (updated) {
                    await order.save();
                }
                // Emit socket event
                if (io) {
                    const roomName = `sub_${order.subscriptionId}`;
                    io.to(roomName).emit('daily_menu_updated', {
                        subscriptionId: order.subscriptionId,
                        deliveryDate: order.deliveryDate,
                        dishName: defaultName
                    });
                }
            }
        } catch (orderUpdateErr) {
            logger.warn(`Failed to restore daily orders default name: ${orderUpdateErr.message}`);
        }

        res.json({ success: true, message: 'Daily menu customization removed' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Vendor Earnings (with VAT breakdown) ────────────────────────────────
router.get('/earnings', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { period = 'week' } = req.query;

        const start = new Date();
        if (period === 'week') start.setDate(start.getDate() - 7);
        else if (period === 'month') start.setDate(start.getDate() - 30);
        else start.setHours(0, 0, 0, 0);

        const vendor = await FoodRestaurant.findById(vendorId).select('commissionRate vatRate');
        const orders = await FoodOrder.find({
            restaurantId: vendorId,
            orderStatus: 'delivered',
            deliveryDate: { $gte: start }
        });

        let grossFoodRevenue = 0;
        orders.forEach(o => { grossFoodRevenue += o.pricing?.subtotal || 0; });

        const vatRate = vendor?.vatRate || 0.08;
        const commissionRate = vendor?.commissionRate || 0.15;

        const foodNetRevenue = grossFoodRevenue / (1 + vatRate);
        const foodVatAmount = grossFoodRevenue - foodNetRevenue;
        const commissionAmount = grossFoodRevenue * commissionRate;
        const vendorNetPayout = grossFoodRevenue - commissionAmount;

        res.json({
            success: true,
            period,
            ordersCount: orders.length,
            earnings: {
                grossFoodRevenue,
                foodVatRate: `${vatRate * 100}%`,
                foodVatAmount: foodVatAmount.toFixed(2),
                platformCommission: commissionAmount.toFixed(2),
                vendorNetPayout: vendorNetPayout.toFixed(2)
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Active Subscribers ───────────────────────────────────────────────────
router.get('/subscribers', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const subs = await DMBSubscription.find({ vendorId: req.user.userId, status: 'active' })
            .populate('userId', 'name city deliverySlot')
            .populate('mealPlanId', 'name')
            .sort({ createdAt: -1 });
        res.json({ success: true, count: subs.length, subscribers: subs });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Update Operational Settings (Vacation, Cutoff) ──────────────────────
router.put('/settings', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { vacationMode, vacationStart, vacationEnd } = req.body;

        const update = {};
        if (vacationMode !== undefined) update.vacationMode = vacationMode;
        if (vacationStart !== undefined) update.vacationStart = vacationStart ? new Date(vacationStart) : null;
        if (vacationEnd !== undefined) update.vacationEnd = vacationEnd ? new Date(vacationEnd) : null;

        const vendor = await FoodRestaurant.findByIdAndUpdate(
            vendorId,
            { $set: update },
            { new: true }
        );

        res.json({
            success: true,
            settings: {
                vacationMode: vendor.vacationMode,
                vacationStart: vendor.vacationStart,
                vacationEnd: vendor.vacationEnd
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── PUBLIC: Get Vendor's Menu (Meal Plans) ─────────────────────────────
// No auth required — customers browse vendor menus from PlansScreen
router.get('/:vendorId/menu', async (req, res) => {
    try {
        const plans = await DMBMealPlan.find({
            vendorId: req.params.vendorId,
            status: 'active'
        }).select('name description pricePerDay photos nutrition allergens dietTags availableSlots availableDays capacity').sort({ createdAt: -1 });
        res.json({ success: true, menu: plans });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── PUBLIC: Get Vendor's Subscription Plans ─────────────────────────────
// Returns structured subscription plan options for a vendor
router.get('/:vendorId/plans', async (req, res) => {
    try {
        const vendor = await FoodRestaurant.findById(req.params.vendorId).select('restaurantName city ownerName profileImage coverImages ratings rating');
        if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

        const mealPlans = await DMBMealPlan.find({
            vendorId: req.params.vendorId,
            status: 'active'
        }).select('name pricePerDay availableSlots availableDays capacity nutrition');

        // Build subscription plan options
        const subscriptionPlans = [
            {
                id: 'mon_fri',
                label: 'Mon–Fri',
                days: 5,
                deliveryDays: 'mon_fri',
                description: 'Weekday meals only',
                priceMultiplier: 1,
            },
            {
                id: 'full_week',
                label: 'Full Week',
                days: 7,
                deliveryDays: 'full_week',
                description: 'All 7 days',
                priceMultiplier: 1.3,
            }
        ];

        res.json({
            success: true,
            vendor: {
                id: vendor._id,
                name: vendor.restaurantName,
                city: vendor.city,
                ownerName: vendor.ownerName,
                profileImage: vendor.profileImage,
                rating: vendor.ratings?.average || vendor.rating || 4.5
            },
            mealPlans,
            subscriptionPlans
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Toggle Meal Plan Status + Notify Subscribers ───────────────────────
router.put('/meal-plans/:planId/toggle-status', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const plan = await DMBMealPlan.findOne({ _id: req.params.planId, vendorId: req.user.userId });
        if (!plan) return res.status(404).json({ success: false, message: 'Meal plan not found' });

        const newStatus = plan.status === 'active' ? 'draft' : 'active';
        plan.status = newStatus;
        await plan.save();

        // If plan activated → notify all active subscribers of this vendor
        if (newStatus === 'active') {
            const subs = await DMBSubscription.find({
                vendorId: req.user.userId,
                status: 'active'
            }).select('userId').lean();

            if (subs.length > 0) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = tomorrow.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

                // Send FCM + in-app notifications to all subscribers
                const notificationPromises = subs.map(sub =>
                    sendNotificationToUser({
                        recipientId: sub.userId,
                        recipientType: 'user',
                        title: '🍱 Tomorrow\'s Meal Ready!',
                        body: `${plan.name} will be delivered on ${tomorrowStr}. Get ready!`,
                        data: { screen: 'home', event: 'meal_activated', planName: plan.name }
                    }).catch(e => logger.warn(`Notification failed for user ${sub.userId}: ${e.message}`))
                );

                // Also create in-app inbox notifications
                const inboxNotifications = subs.map(sub => ({
                    ownerType: 'USER',
                    ownerId: sub.userId,
                    title: '🍱 Tomorrow\'s Meal is Confirmed!',
                    message: `${plan.name} from your vendor is confirmed for tomorrow. Bon appétit!`,
                    category: 'meal_update'
                }));

                await Promise.allSettled([
                    ...notificationPromises,
                    createInboxNotifications({ notifications: inboxNotifications })
                ]);

                logger.info(`Meal plan ${plan._id} activated — notified ${subs.length} subscribers`);
            }
        }

        res.json({ success: true, plan, newStatus, message: `Meal plan ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully` });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Active Subscribers Count ─────────────────────────────────────────────
router.get('/subscriber-stats', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const [total, active, paused] = await Promise.all([
            DMBSubscription.countDocuments({ vendorId: req.user.userId }),
            DMBSubscription.countDocuments({ vendorId: req.user.userId, status: 'active' }),
            DMBSubscription.countDocuments({ vendorId: req.user.userId, status: 'paused' }),
        ]);
        res.json({ success: true, stats: { total, active, paused } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── NEW: Get Vendor's Daily Orders (today/tomorrow) ────────────────────────
// ?date=2026-06-07 (default: today)
// ?slot=lunch
router.get('/daily-orders', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId || req.user._id;
        const { date, slot } = req.query;
        const orders = await getVendorDailyOrders(vendorId, { date, slot });
        res.json({ success: true, orders, count: orders.length });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── NEW: Update Single Order Status (Preparing / Ready) ──────────────────
// PATCH /api/v1/dmb/vendor/daily-orders/:orderId/status
// Body: { status: 'preparing' | 'ready' | ... }
router.patch('/daily-orders/:orderId/status', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId || req.user._id;
        const { status } = req.body;
        if (!status) return res.status(400).json({ success: false, message: 'status is required' });
        const order = await updateDailyOrderStatus(req.params.orderId, status, vendorId);
        res.json({ success: true, order });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── NEW: Mark ALL orders ready for a slot (batch) ─────────────────────────
// POST /api/v1/dmb/vendor/daily-orders/mark-all-ready
// Body: { date, slot }
router.post('/daily-orders/mark-all-ready', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId || req.user._id;
        const { date, slot } = req.body;
        const result = await markAllOrdersReady(vendorId, { date, slot });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Verify Driver OTP for Batch Collection ──────────────────────────────
router.post('/daily-orders/verify-batch-otp', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId || req.user._id;
        const { batchId, otp } = req.body;

        if (!batchId || !otp) {
            return res.status(400).json({ success: false, message: 'batchId and otp are required' });
        }

        const { CollectionBatch } = await import('../delivery/collectionBatch.model.js');
        const batch = await CollectionBatch.findOne({ batchId, vendorId });

        if (!batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }

        if (batch.status === 'collected' || batch.pinVerified) {
            return res.status(400).json({ success: false, message: 'Batch already collected' });
        }

        if (batch.collectionPinHash !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        batch.pinVerified = true;
        batch.status = 'collected';
        batch.collectedAt = new Date();
        await batch.save();

        const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
        // Update all orders in batch to picked_up
        await DMBDailyOrder.updateMany(
            { _id: { $in: batch.orderIds } },
            { $set: { status: 'out_for_delivery', pickedUpAt: new Date() } }
        );

        // Notify driver
        const io = (await import('../../../config/socket.js')).getIO();
        if (io && batch.driverId) {
            io.to(`delivery:${batch.driverId}`).emit('batch_collected_success', { batchId: batch.batchId });
        }

        res.json({ success: true, message: 'OTP verified, batch collected' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── NEW: Resend Batch Request to Drivers ──────────────────────────────
router.post('/daily-orders/resend-batch', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId || req.user._id;
        const { date, slot } = req.body;
        
        const targetDate = date ? new Date(date) : new Date();
        targetDate.setUTCHours(0, 0, 0, 0);

        const { CollectionBatch } = await import('../delivery/collectionBatch.model.js');
        let batch = await CollectionBatch.findOne({ 
            vendorId, 
            deliveryDate: targetDate, 
            deliverySlot: slot || 'lunch',
            status: { $in: ['pending', 'driver_assigned'] }
        });

        if (batch) {
            if (batch.status === 'driver_assigned') {
                batch.driverId = null;
                batch.status = 'pending';
                batch.collectionPinHash = ''; 
                await batch.save();

                // Clear driverId on all daily orders in this batch
                const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
                await DMBDailyOrder.updateMany(
                    { _id: { $in: batch.orderIds } },
                    { $set: { 'dispatch.deliveryPartnerId': null } }
                );
            }
        } else {
            // Check if there are unassigned 'ready' or 'scheduled'/'preparing' orders that can form a new batch!
            const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
            const unassignedOrders = await DMBDailyOrder.find({
                vendorId,
                deliveryDate: targetDate,
                deliverySlot: slot || 'lunch',
                status: { $in: ['scheduled', 'preparing', 'ready'] },
                $or: [
                    { 'dispatch.deliveryPartnerId': null },
                    { 'dispatch.deliveryPartnerId': { $exists: false } },
                    { dispatch: { $exists: false } }
                ]
            });

            /*
            if (unassignedOrders.length === 0) {
                return res.status(404).json({ success: false, message: 'No unassigned batch or orders found for this slot.' });
            }
            */

            let ordersToUse = unassignedOrders;
            if (ordersToUse.length === 0) {
                // Generate 5 mock orders for this vendor so they can request delivery and test!
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

                const vendor = await FoodRestaurant.findById(vendorId);
                const vendorLng = vendor?.location?.coordinates?.[0] || 77.1025;
                const vendorLat = vendor?.location?.coordinates?.[1] || 28.7041;

                const generatedOrders = [];
                for (let i = 0; i < 5; i++) {
                    const latOffset = (Math.random() - 0.5) * 0.03;
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
                        vendorId: new mongoose.Types.ObjectId(vendorId),
                        meals: [
                            {
                                mealPlanId: new mongoose.Types.ObjectId(),
                                name: `Healthy Meal ${(slot || 'lunch') === 'lunch' ? 'Lunch' : 'Dinner'} Box`,
                                quantity: 1
                            }
                        ],
                        deliveryDate: targetDate,
                        deliverySlot: slot || 'lunch',
                        status: 'ready',
                        collectionPin: '4901',
                        deliveryPin: otp,
                        pricing: {
                            totalPrice: 15,
                            currency: 'PLN'
                        },
                        deliveryAddress: {
                            street: `Mock Street No. ${i + 1}`,
                            city: vendor?.city || 'Indore',
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
                    generatedOrders.push(mockOrder);
                }
                ordersToUse = generatedOrders;
            } else {
                // Mark any scheduled/preparing as ready
                for (const order of ordersToUse) {
                    if (order.status !== 'ready') {
                        order.status = 'ready';
                        order.readyAt = new Date();
                        await order.save();
                    }
                }
            }

            // Create a new batch for these unassigned ready orders!
            batch = await CollectionBatch.create({
                vendorId,
                deliveryDate: targetDate,
                deliverySlot: slot || 'lunch',
                boxCount: ordersToUse.length,
                orderIds: ordersToUse.map(o => o._id),
                status: 'pending'
            });
        }

        const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName location zoneId serviceZone city phone');
        const vendorZoneId = vendor?.zoneId || vendor?.serviceZone;
        const vendorCity = vendor?.city || vendor?.location?.city;

        if (!vendorZoneId && !vendorCity) {
            return res.status(400).json({ success: false, message: 'Vendor zone/city not configured.' });
        }

        const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
        
        const driverFilter = {
            availabilityStatus: 'online',
            status: 'approved',
        };

        const locationConditions = [];

        if (vendorZoneId) {
            locationConditions.push({ zoneIds: vendorZoneId });
            locationConditions.push({ zoneIds: vendorZoneId.toString() }); // handle ObjectId vs string mismatch
            try {
                const mongoose = (await import('mongoose')).default;
                if (mongoose.Types.ObjectId.isValid(vendorZoneId)) {
                    locationConditions.push({ zoneIds: new mongoose.Types.ObjectId(vendorZoneId.toString()) });
                }
            } catch (e) {
                // ignore
            }
        }

        if (vendorCity) {
            const trimmedCity = vendorCity.trim();
            if (trimmedCity) {
                locationConditions.push({ city: { $regex: new RegExp(`^${trimmedCity}$`, 'i') } });
                locationConditions.push({ 'location.city': { $regex: new RegExp(`^${trimmedCity}$`, 'i') } });
            }
        }

        if (locationConditions.length > 0) {
            driverFilter.$or = locationConditions;
        }

        let onlineDrivers = await FoodDeliveryPartner.find(driverFilter).select('_id');

        if (onlineDrivers.length === 0) {
            logger.warn(`[VENDOR-RESEND] Zero drivers matched zone/city. Filter: ${JSON.stringify(driverFilter)}`);
            // Last-resort fallback: fetch ANY online approved driver in the system
            const fallbackDrivers = await FoodDeliveryPartner.find({
                availabilityStatus: 'online',
                status: 'approved'
            }).select('_id').limit(50);
            logger.warn(`[VENDOR-RESEND] Fallback: found ${fallbackDrivers.length} online drivers in system`);
            onlineDrivers = fallbackDrivers;
        }

        const io = (await import('../../../config/socket.js')).getIO();
        
        // In development mode, retrieve all currently connected WebSocket drivers and add them to target list
        if (process.env.NODE_ENV === 'development' && io) {
            try {
                const activeSockets = await io.fetchSockets();
                for (const socket of activeSockets) {
                    if (socket.user?.role === 'DELIVERY_PARTNER' && socket.user?.userId) {
                        const driverIdStr = socket.user.userId.toString();
                        if (!onlineDrivers.some(d => d._id.toString() === driverIdStr)) {
                            onlineDrivers.push({ _id: new mongoose.Types.ObjectId(driverIdStr) });
                        }
                    }
                }
            } catch (err) {
                logger.warn(`[VENDOR-RESEND] Failed to fetch active socket connections: ${err.message}`);
            }
        }

        if (onlineDrivers.length === 0) {
            return res.status(400).json({ success: false, message: 'No online delivery partners found.' });
        }

        if (io) {
            const payload = {
                batchId: batch.batchId,
                slotType: batch.deliverySlot,      // Slot Type
                totalMealBoxCount: batch.boxCount, // Total Meal Box Count for that slot
                vendorInfo: {
                    vendorId: vendor._id,
                    vendorName: vendor.restaurantName,
                    vendorLocation: vendor.location,
                    vendorPhone: vendor.phone || ''
                },
                pickupStatus: batch.status,

                // Backward compatibility
                vendorId: vendor._id,
                vendorName: vendor.restaurantName,
                vendorLocation: vendor.location,
                boxCount: batch.boxCount,
                slot: batch.deliverySlot,
                totalOrders: batch.boxCount
            };

            onlineDrivers.forEach(driver => {
                io.to(`delivery:${driver._id.toString()}`).emit('new_delivery_request', payload);
            });
        }

        res.json({ success: true, message: `Request resent to ${onlineDrivers.length} online drivers.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── NEW: Get Assigned Driver Location for Vendor ──────────────────────
router.get('/daily-orders/assigned-driver', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId || req.user._id;
        const { date, slot } = req.query;

        const targetDate = date ? new Date(date) : new Date();
        targetDate.setUTCHours(0, 0, 0, 0);

        const { CollectionBatch } = await import('../delivery/collectionBatch.model.js');
        const batch = await CollectionBatch.findOne({
            vendorId,
            deliveryDate: targetDate,
            deliverySlot: slot || 'lunch',
            status: 'driver_assigned'
        });

        if (!batch || !batch.driverId) {
            return res.status(404).json({ success: false, message: 'No assigned driver found.' });
        }

        const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
        const driver = await FoodDeliveryPartner.findById(batch.driverId)
            .select('name phone profilePhoto vehicleNumber lastLat lastLng lastLocationAt availabilityStatus');

        if (!driver) {
            return res.status(404).json({ success: false, message: 'Driver not found.' });
        }

        res.json({
            success: true,
            driver: {
                _id: driver._id,
                name: driver.name,
                phone: driver.phone,
                profilePhoto: driver.profilePhoto,
                vehicleNumber: driver.vehicleNumber,
                lastLat: driver.lastLat,
                lastLng: driver.lastLng,
                lastLocationAt: driver.lastLocationAt,
                isOnline: driver.availabilityStatus === 'online'
            },
            batchId: batch.batchId,
            otp: batch.collectionPinHash
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
