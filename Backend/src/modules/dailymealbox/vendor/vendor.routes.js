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
import { PantryItem } from '../../food/restaurant/models/pantryItem.model.js';
import { FoodItem } from '../../food/admin/models/food.model.js';
import { PantryOrder } from '../../food/restaurant/models/pantryOrder.model.js';
import { upload } from '../../../middleware/upload.js';
import { assertValidSlotKeys } from '../deliverySlot/deliverySlot.service.js';
import { msg, translateFor } from '../../i18n/i18n.service.js';

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
        if (req.body?.availableSlots?.length) await assertValidSlotKeys(req.body.availableSlots);
        const plan = await DMBMealPlan.create({ vendorId: req.user.userId, ...req.body });
        res.status(201).json({ success: true, plan });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.put('/meal-plans/:planId', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        if (req.body?.availableSlots?.length) await assertValidSlotKeys(req.body.availableSlots, { allowDisabled: true });
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
        const { mealPlanId, date, slot, dishName, description, photo, nutrition } = req.body;
        if (!mealPlanId || !date || !dishName || !slot) {
            return res.status(400).json({ success: false, message: 'mealPlanId, date, slot and dishName are required' });
        }

        const normalizedDate = new Date(date);
        normalizedDate.setUTCHours(0, 0, 0, 0);
        const finalSlot = slot;

        // ─── Enforce: ONE meal per vendor per day per slot ───────────────────────
        // Delete any existing daily menu for this vendor+date+slot with a DIFFERENT mealPlanId
        await DMBDailyMenu.deleteMany({
            vendorId,
            date: normalizedDate,
            slot: finalSlot,
            mealPlanId: { $ne: mealPlanId }
        });

        // Find and update or create
        const dailyMenu = await DMBDailyMenu.findOneAndUpdate(
            { vendorId, mealPlanId, date: normalizedDate, slot: finalSlot },
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

            // Find ALL scheduled orders for this vendor+date (any slot) to update meal name
            // where the slot matches finalSlot
            const slotOrdersToUpdate = await DMBDailyOrder.find({
                vendorId,
                deliveryDate: { $gte: dayStart, $lt: dayEnd },
                deliverySlot: finalSlot,
                status: 'scheduled'
            });

            // Also find ALL orders for this vendor+date (all slots) to notify affected users
            const allDateOrders = await DMBDailyOrder.find({
                vendorId,
                deliveryDate: { $gte: dayStart, $lt: dayEnd },
                status: 'scheduled'
            }).select('userId subscriptionId deliverySlot').lean();

            const io = getSocketIo();

            // Update meal names for matching-slot orders
            for (const order of slotOrdersToUpdate) {
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
            }

            // Emit daily_menu_updated to ALL affected customer user rooms for this vendor+date
            // This ensures customers see the update in CalendarScreen even if their specific slot
            // wasn't the one just set (they need to refresh to see newly created orders)
            if (io) {
                const notifiedUsers = new Set();
                const notifiedSubs = new Set();

                for (const order of allDateOrders) {
                    const userRoom = `user:${order.userId}`;
                    const subRoom = `sub_${order.subscriptionId}`;
                    const payload = {
                        subscriptionId: order.subscriptionId,
                        deliveryDate: normalizedDate,
                        deliverySlot: finalSlot,
                        dishName,
                        vendorId: String(vendorId)
                    };

                    if (!notifiedUsers.has(String(order.userId))) {
                        io.to(userRoom).emit('daily_menu_updated', payload);
                        notifiedUsers.add(String(order.userId));
                    }
                    if (!notifiedSubs.has(String(order.subscriptionId))) {
                        io.to(subRoom).emit('daily_menu_updated', payload);
                        notifiedSubs.add(String(order.subscriptionId));
                    }
                }

                // Also notify users who have active subscriptions with this vendor but
                // may not have orders generated yet (edge case: generateDailyOrdersForDate
                // may not have created orders if subscription startDate is in the future, etc.)
                const activeSubs = await DMBSubscription.find({ vendorId, status: 'active' })
                    .select('userId _id').lean();
                for (const sub of activeSubs) {
                    const userRoom = `user:${sub.userId}`;
                    if (!notifiedUsers.has(String(sub.userId))) {
                        io.to(userRoom).emit('daily_menu_updated', {
                            subscriptionId: sub._id,
                            deliveryDate: normalizedDate,
                            deliverySlot: finalSlot,
                            dishName,
                            vendorId: String(vendorId)
                        });
                        notifiedUsers.add(String(sub.userId));
                        logger.info(`Socket emitted daily_menu_updated (sub-level fallback) to user:${sub.userId} for: ${dishName} [${finalSlot}]`);
                    }
                }

                logger.info(`Socket emitted daily_menu_updated to ${notifiedUsers.size} users and ${notifiedSubs.size} sub rooms for: ${dishName} [${finalSlot}] on ${normalizedDate.toISOString().split('T')[0]}`);
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
        const { mealPlanId, date, slot } = req.query;
        if (!mealPlanId || !date || !slot) {
            return res.status(400).json({ success: false, message: 'mealPlanId, date and slot are required' });
        }

        const normalizedDate = new Date(date);
        normalizedDate.setUTCHours(0, 0, 0, 0);
        const finalSlot = slot;

        await DMBDailyMenu.deleteOne({ vendorId, mealPlanId, date: normalizedDate, slot: finalSlot });

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
                deliverySlot: finalSlot,
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
                    const userRoom = `user:${order.userId}`;
                    const payload = {
                        subscriptionId: order.subscriptionId,
                        deliveryDate: order.deliveryDate,
                        deliverySlot: finalSlot,
                        dishName: defaultName,
                        vendorId: String(vendorId)
                    };
                    io.to(roomName).emit('daily_menu_updated', payload);
                    io.to(userRoom).emit('daily_menu_updated', payload);
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
            .populate('userId', 'name firstName lastName city deliverySlot phone')
            .populate('mealPlanId', 'name')
            .sort({ createdAt: -1 })
            .lean();

        const pantrySubs = await PantryOrder.find({ vendorId: req.user.userId, status: 'paid' })
            .populate('userId', 'name firstName lastName city phone')
            .sort({ createdAt: -1 })
            .lean();

        const formattedPantrySubs = pantrySubs.map(po => ({
            _id: po._id,
            userId: po.userId,
            status: po.status === 'paid' ? 'active' : po.status,
            createdAt: po.createdAt,
            startDate: po.createdAt,
            mealPlanId: { name: 'Pantry items: ' + po.items.map(i => `${i.quantity}x ${i.title}`).join(', ') },
            isPantry: true
        }));

        const allSubs = [...subs, ...formattedPantrySubs].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, count: allSubs.length, subscribers: allSubs });
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

// ─── PUBLIC: Get All Pantry Items ──────────────────────────────────────────
router.get('/pantry-items/all', async (req, res) => {
    try {
        const pantryVendors = await FoodRestaurant.find({ vendorType: 'pantry_shop', status: 'approved' }).select('_id');
        const vendorIds = pantryVendors.map(v => v._id);

        const foods = await FoodItem.find({ 
            restaurantId: { $in: vendorIds },
            isAvailable: true,
            approvalStatus: 'approved'
        })
        .populate('restaurantId', 'restaurantName city')
        .sort({ createdAt: -1 });

        const items = foods.map(food => ({
            _id: food._id,
            title: food.name,
            price: food.price || (food.variants && food.variants.length > 0 ? food.variants[0].price : 0),
            image: food.image,
            isAvailable: food.isAvailable,
            vendorId: food.restaurantId,
            variants: food.variants,
            description: food.description,
            categoryId: food.categoryId,
            categoryName: food.categoryName,
        }));

        res.json({ success: true, items });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── PUBLIC: Get Vendor Pricing Config (Food VAT %, Platform Fee) ───────────────
router.get('/:vendorId/pricing-config', async (req, res) => {
    try {
        const { FoodRestaurantCommission } = await import('../../food/admin/models/restaurantCommission.model.js');
        const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');

        const commConfig = await FoodRestaurantCommission.findOne({ restaurantId: req.params.vendorId }).lean();
        const feeConfig = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();

        res.json({
            success: true,
            foodVatPercent: Number(commConfig?.foodVatPercent ?? 0),
            platformFee: Number(feeConfig?.platformFee ?? 0),
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── PUBLIC: Get Vendor's Pantry Items ─────────────────────────────────────
router.get('/:vendorId/pantry-items', async (req, res) => {
    try {
        const vendor = await FoodRestaurant.findById(req.params.vendorId).select('restaurantName');
        if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

        const items = await PantryItem.find({
            vendorId: req.params.vendorId,
            isAvailable: true
        }).sort({ createdAt: -1 });

        res.json({ success: true, items });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── PUBLIC: Get Single Pantry Item ─────────────────────────────────────────
router.get('/pantry-items/:id', async (req, res) => {
    try {
        let item = await PantryItem.findById(req.params.id).populate('vendorId', 'restaurantName city');
        if (!item) {
            item = await FoodItem.findById(req.params.id).populate('restaurantId', 'restaurantName city');
            if (item) {
                // normalize FoodItem to match PantryItem structure for response
                item = {
                    _id: item._id,
                    title: item.name,
                    price: item.price || (item.variants && item.variants.length > 0 ? item.variants[0].price : 0),
                    image: item.image,
                    isAvailable: item.isAvailable,
                    vendorId: item.restaurantId,
                    variants: item.variants,
                    description: item.description,
                    categoryId: item.categoryId,
                    categoryName: item.categoryName,
                };
            }
        }
        
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        // Generate otherPlatformPrice logic (e.g. 30% higher)
        const basePrice = item.price || 0;
        const otherPlatformPrice = Math.ceil(basePrice * 1.3);

        const responseItem = item.toObject ? item.toObject() : item;

        res.json({ 
            success: true, 
            item: {
                ...responseItem,
                otherPlatformPrice
            }
        });
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

        const query = {
            vendorId: req.params.vendorId,
            status: 'active'
        };

        if (req.query.dietType && req.query.dietType !== 'No preference') {
            query.dietTags = req.query.dietType.toLowerCase();
        }

        if (req.query.excludeAllergies) {
            const allergies = req.query.excludeAllergies.split(',').map(a => a.trim());
            // Exclude meal plans that contain ANY of the excluded allergies
            query.allergies = { $nin: allergies };
        }

        const mealPlans = await DMBMealPlan.find(query).select('name pricePerDay availableSlots availableDays capacity nutrition dietTags allergens');

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
                        title: msg("🍱 Tomorrow's Meal Ready!"),
                        body: msg('{{planName}} will be delivered on {{date}}. Get ready!', { planName: plan.name, date: tomorrowStr }),
                        data: { screen: 'home', event: 'meal_activated', planName: plan.name }
                    }).catch(e => logger.warn(`Notification failed for user ${sub.userId}: ${e.message}`))
                );

                // Also create in-app inbox notifications
                const inboxNotifications = await Promise.all(subs.map(async (sub) => ({
                    ownerType: 'USER',
                    ownerId: sub.userId,
                    title: await translateFor('USER', sub.userId, "🍱 Tomorrow's Meal is Confirmed!"),
                    message: await translateFor('USER', sub.userId, '{{planName}} from your vendor is confirmed for tomorrow. Bon appétit!', { planName: plan.name }),
                    category: 'meal_update'
                })));

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
        const [totalDMB, activeDMB, pausedDMB, pantrySubs] = await Promise.all([
            DMBSubscription.countDocuments({ vendorId: req.user.userId }),
            DMBSubscription.countDocuments({ vendorId: req.user.userId, status: 'active' }),
            DMBSubscription.countDocuments({ vendorId: req.user.userId, status: 'paused' }),
            PantryOrder.countDocuments({ vendorId: req.user.userId, status: 'paid' })
        ]);
        
        const total = totalDMB + pantrySubs;
        const active = activeDMB + pantrySubs;
        const paused = pausedDMB;
        
        res.json({ success: true, stats: { total, active, paused } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── NEW: Get Vendor's Daily Orders (today/tomorrow) ────────────────────────
router.get('/settings', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendor = await FoodRestaurant.findById(req.user.userId)
            .select('restaurantName cuisines openingTime closingTime isAcceptingOrders profileImage');
        res.json({ success: true, settings: vendor });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Pantry Shop Routes ───────────────────────────────────────────────────

router.post('/pantry-items', authMiddleware, requireRoles('RESTAURANT'), upload.single('image'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const { title, price, isAvailable } = req.body;

        let imageUrl = '';
        if (req.file) {
            imageUrl = await uploadImageBuffer(req.file.buffer, 'pantry_items');
        } else {
            return res.status(400).json({ success: false, message: 'Image is required' });
        }

        const item = await PantryItem.create({
            vendorId,
            title,
            price: Number(price),
            image: imageUrl,
            isAvailable: isAvailable === 'true' || isAvailable === true
        });

        res.status(201).json({ success: true, item });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.get('/pantry-items', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const items = await PantryItem.find({ vendorId }).sort({ createdAt: -1 });
        res.json({ success: true, items });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.patch('/pantry-items/:id', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const item = await PantryItem.findOneAndUpdate(
            { _id: req.params.id, vendorId },
            { $set: req.body },
            { new: true }
        );
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
        res.json({ success: true, item });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── NEW: Delete Vendor's Pantry Item ───────────────────────────────────────
router.delete('/pantry-items/:id', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId;
        const item = await PantryItem.findOneAndDelete({ _id: req.params.id, vendorId });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
        res.json({ success: true, message: 'Item deleted successfully' });
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
// Helper to check if vendor has pending/undelivered orders from previous batches or slots
async function checkPendingDeliveriesForVendor(vendorId, requestedSlot, targetDate) {
    const { CollectionBatch } = await import('../delivery/collectionBatch.model.js');

    // Only check batches for the SAME date and SAME slot.
    // Cross-slot batches (e.g., a Lunch batch still in transit) must NEVER block
    // a different slot (e.g., Dinner) from generating a new collection PIN.
    const batches = await CollectionBatch.find({
        vendorId,
        deliveryDate: targetDate,
        deliverySlot: requestedSlot
    });

    for (const batch of batches) {
        if (!batch.orderIds || batch.orderIds.length === 0) continue;

        // Skip batches that are already completed or failed
        if (['collected', 'failed'].includes(batch.status)) continue;

        // pending/driver_assigned batches for this same slot will be re-used or updated
        // by the caller — they are not a blocking condition
        if (['pending', 'driver_assigned'].includes(batch.status)) continue;
    }

    return { hasPending: false };
}

// ─── NEW: Resend Batch Request to Drivers ──────────────────────────────
router.post('/daily-orders/resend-batch', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const vendorId = req.user.userId || req.user._id;
        const { date, slot } = req.body;
        if (!slot) {
            return res.status(400).json({ success: false, message: 'slot is required' });
        }
        const requestedSlot = slot;

        const targetDate = date ? new Date(date) : new Date();
        targetDate.setUTCHours(0, 0, 0, 0);

        // 1. Fetch all daily orders for this slot and date to perform readiness validations.
        const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
        const allOrders = await DMBDailyOrder.find({
            vendorId,
            deliveryDate: targetDate,
            deliverySlot: requestedSlot
        });

        // 3. Verify that orders exist.
        if (allOrders.length === 0) {
            return res.status(400).json({ success: false, message: `No orders found for the ${requestedSlot} slot on this date.` });
        }

        // 4. Verify that all eligible/active orders in the slot are Ready (none are scheduled or preparing).
        const eligibleOrders = allOrders.filter(o => ['scheduled', 'preparing', 'ready'].includes(o.status));
        const pendingOrders = eligibleOrders.filter(o => ['scheduled', 'preparing'].includes(o.status));
        if (pendingOrders.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot request delivery partner: ${pendingOrders.length} orders in this slot are still pending (scheduled or preparing). All orders must be marked Ready first.`
            });
        }

        // 5. Verify that there is at least one Ready order to request delivery for.
        const readyOrders = eligibleOrders.filter(o => o.status === 'ready');
        if (readyOrders.length === 0) {
            return res.status(400).json({
                success: false,
                message: `No ready orders found to request delivery for (they may already be in transit or delivered).`
            });
        }

        // 6. Check for pending deliveries across previous/current slots before generating a new PIN / batch
        const pendingCheck = await checkPendingDeliveriesForVendor(vendorId, requestedSlot, targetDate);
        if (pendingCheck.hasPending) {
            return res.status(400).json({
                success: false,
                message: `A new collection PIN cannot be generated because there are pending deliveries for the ${pendingCheck.slot} slot (Batch: ${pendingCheck.batchId}). Please wait until the driver completes all deliveries.`
            });
        }

        const { CollectionBatch } = await import('../delivery/collectionBatch.model.js');
        let batch = await CollectionBatch.findOne({
            vendorId,
            deliveryDate: targetDate,
            deliverySlot: requestedSlot,
            status: { $in: ['pending', 'driver_assigned'] }
        });

        if (batch) {
            if (batch.status === 'driver_assigned') {
                batch.driverId = null;
                batch.status = 'pending';
                batch.collectionPinHash = '';
                await batch.save();

                // Clear driverId on all daily orders in this batch
                await DMBDailyOrder.updateMany(
                    { _id: { $in: batch.orderIds } },
                    { $set: { 'dispatch.deliveryPartnerId': null } }
                );
            }
        } else {
            // Create a new batch for these ready orders!
            const crypto = await import('crypto');
            const pin = String(Math.floor(1000 + crypto.randomInt(9000))).padStart(4, '0');
            batch = await CollectionBatch.create({
                vendorId,
                deliveryDate: targetDate,
                deliverySlot: requestedSlot,
                collectionPinHash: pin,
                boxCount: readyOrders.length,
                orderIds: readyOrders.map(o => o._id),
                status: 'pending'
            });
        }

        const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName location zoneId serviceZone city phone addressLine1');
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
                            const mongoose = (await import('mongoose')).default;
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
            const ordersInBatch = await DMBDailyOrder.find({ _id: { $in: batch.orderIds } }).populate('userId', 'name phone');
            const ordersDetails = ordersInBatch.map(o => ({
                _id: o._id,
                orderId: o.orderId,
                status: o.status,
                deliveryAddress: o.deliveryAddress,
                meals: o.meals,
                customer: {
                    name: o.userId?.name || '',
                    phone: o.userId?.phone || ''
                },
                pricing: o.pricing
            }));

            let feePerOrder = 18; // fallback default
            try {
                const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
                const feeConfig = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
                if (feeConfig && Number(feeConfig.feePerOrder) > 0) {
                    feePerOrder = Number(feeConfig.feePerOrder);
                }
            } catch (feeErr) {
                logger.error(`[VENDOR-RESEND] Failed to fetch fee settings: ${feeErr.message}`);
            }
            const totalEarnings = feePerOrder * batch.boxCount;

            const payload = {
                batchId: batch.batchId,
                slotType: batch.deliverySlot,      // Slot Type
                totalMealBoxCount: batch.boxCount, // Total Meal Box Count for that slot
                vendorInfo: {
                    vendorId: vendor._id,
                    vendorName: vendor.restaurantName,
                    vendorLocation: vendor.location,
                    vendorAddress: vendor.addressLine1 || '',
                    vendorPhone: vendor.phone || ''
                },
                pickupStatus: batch.status,
                orders: ordersDetails,

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

        // Find batch for this vendor/date/slot, or any active batch for today
        let batch = null;
        if (slot) {
            batch = await CollectionBatch.findOne({
                vendorId,
                deliveryDate: targetDate,
                deliverySlot: slot,
                status: { $in: ['pending', 'driver_assigned', 'collected', 'driver_en_route'] }
            });
        }
        if (!batch) {
            batch = await CollectionBatch.findOne({
                vendorId,
                deliveryDate: targetDate,
                status: { $in: ['pending', 'driver_assigned', 'collected', 'driver_en_route'] }
            }).sort({ createdAt: -1 });
        }

        // Determine boxCount
        let boxCount = 0;
        if (batch) {
            boxCount = batch.boxCount || batch.orderIds.length;
        } else {
            const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
            boxCount = await DMBDailyOrder.countDocuments({
                vendorId,
                deliveryDate: targetDate,
                ...(slot ? { deliverySlot: slot } : {}),
                status: 'ready'
            });
        }

        const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
        let driver = null;

        // ONLY return driver if a driver has actually been assigned to this batch
        if (batch && batch.driverId) {
            driver = await FoodDeliveryPartner.findById(batch.driverId)
                .select('name phone profilePhoto vehicleNumber lastLat lastLng lastLocationAt availabilityStatus');
        }


        res.json({
            success: true,
            driver: driver ? {
                _id: driver._id,
                name: driver.name,
                phone: driver.phone,
                profilePhoto: driver.profilePhoto,
                vehicleNumber: driver.vehicleNumber,
                lastLat: driver.lastLat,
                lastLng: driver.lastLng,
                lastLocationAt: driver.lastLocationAt,
                isOnline: driver.availabilityStatus === 'online'
            } : null,
            batchId: batch ? batch.batchId : null,
            otp: batch ? batch.collectionPinHash : null,
            boxCount: boxCount,
            batchStatus: batch ? batch.status : null,
            slot: batch ? batch.deliverySlot : (slot || null)
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Vendor Timing Settings (read-only for vendor panel) ────────────────────
router.get('/timing-settings', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const { getVendorTimingSettings } = await import('../../food/admin/services/admin.service.js');
        const data = await getVendorTimingSettings();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
