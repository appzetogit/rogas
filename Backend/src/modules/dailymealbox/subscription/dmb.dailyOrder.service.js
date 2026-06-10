import { DMBDailyOrder } from './dmb.dailyOrder.model.js';
import { DMBSubscription } from './subscription.model.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { CollectionBatch } from '../delivery/collectionBatch.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { getIO } from '../../../config/socket.js';
import { logger } from '../../../utils/logger.js';
import crypto from 'crypto';

/**
 * DMB Daily Orders Service
 * Handles creation and management of per-day delivery instances
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toDateOnly = (date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

const dateStr = (date) => new Date(date).toISOString().split('T')[0];

// ─── Helper: Fetch fresh dishName from DMBDailyMenu & update order if needed ──
// Ensures vendor's latest meal choice always reflects in customer orders.
const refreshMealNameFromDailyMenu = async (order) => {
    try {
        const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
        const dayStart = toDateOnly(new Date(order.deliveryDate));
        let updated = false;

        for (const m of order.meals) {
            const planId = m.mealPlanId?._id || m.mealPlanId;
            if (!planId) continue;
            try {
                let dailyMenuItem = await DMBDailyMenu.findOne({
                    vendorId: order.vendorId,
                    mealPlanId: planId,
                    date: dayStart
                }).lean();
                if (!dailyMenuItem) {
                    dailyMenuItem = await DMBDailyMenu.findOne({
                        vendorId: order.vendorId,
                        date: dayStart
                    }).lean();
                }
                if (dailyMenuItem?.dishName && m.name !== dailyMenuItem.dishName) {
                    m.name = dailyMenuItem.dishName;
                    updated = true;
                }
            } catch (e) { /* ignore */ }
        }

        if (updated) {
            await DMBDailyOrder.updateOne({ _id: order._id }, { $set: { meals: order.meals } });
        }
    } catch (e) {
        // silently ignore import errors
    }
    return order;
};

// ─── Helper: Fetch and attach custom daily menu details (photo, nutrition) to lean orders ──
const attachDailyMenuDetails = async (orders) => {
    try {
        const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
        const ordersArray = Array.isArray(orders) ? orders : [orders];
        for (const order of ordersArray) {
            const dayStart = toDateOnly(new Date(order.deliveryDate));
            for (const m of (order.meals || [])) {
                const planId = m.mealPlanId?._id || m.mealPlanId;
                let dailyMenuItem = null;
                if (planId) {
                    dailyMenuItem = await DMBDailyMenu.findOne({
                        vendorId: order.vendorId?._id || order.vendorId,
                        mealPlanId: planId,
                        date: dayStart
                    }).lean();
                }
                if (!dailyMenuItem) {
                    dailyMenuItem = await DMBDailyMenu.findOne({
                        vendorId: order.vendorId?._id || order.vendorId,
                        date: dayStart
                    }).lean();
                }
                if (dailyMenuItem) {
                    if (dailyMenuItem.dishName) m.name = dailyMenuItem.dishName;
                    if (dailyMenuItem.photo) m.customPhoto = dailyMenuItem.photo;
                    if (dailyMenuItem.nutrition) m.customNutrition = dailyMenuItem.nutrition;
                    if (dailyMenuItem.description) m.customDescription = dailyMenuItem.description;
                }
            }
        }
    } catch (e) {
        // silently ignore
    }
    return orders;
};


/**
 * Generate DMBDailyOrder records for all active subscriptions on a given date.
 * Called at startup / CRON / on-demand to ensure orders exist for today+tomorrow.
 */
export const generateDailyOrdersForDate = async (targetDate = new Date()) => {
    const dayStart = toDateOnly(targetDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const dayOfWeek = dayStart.getUTCDay(); // 0=Sun, 1=Mon...6=Sat

    // Skip if Sunday (no deliveries on Sunday by default)
    // For mon_fri subscriptions, skip Sat & Sun
    // This can be customized per subscription's deliveryDays

    const activeSubscriptions = await DMBSubscription.find({ status: 'active' })
        .populate('meals.mealPlanId', 'name pricePerDay')
        .lean();

    let created = 0;
    let skipped = 0;

    for (const sub of activeSubscriptions) {
        try {
            // Check if delivery day is applicable
            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
            const isSaturday = dayOfWeek === 6;
            const isSunday = dayOfWeek === 0;

            const isMonFri = sub.deliveryDays === 'mon_fri';
            const isFullWeek = sub.deliveryDays === 'full_week';

            if (isMonFri && !isWeekday) {
                skipped++;
                continue;
            }
            if (isFullWeek && isSunday) {
                // Full week still skips Sunday in this implementation
                // Can be changed later per PRD
                skipped++;
                continue;
            }

            // Check if order already exists for this sub + date
            const existing = await DMBDailyOrder.findOne({
                subscriptionId: sub._id,
                deliveryDate: { $gte: dayStart, $lt: dayEnd }
            });

            if (existing) {
                skipped++;
                continue;
            }

            // Build meals snapshot
            const mealsSnapshot = [];
            for (const m of (sub.meals || [])) {
                const planId = m.mealPlanId?._id || m.mealPlanId;
                let displayName = m.mealPlanId?.name || 'Meal';
                
                try {
                    const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
                    let dailyMenuItem = await DMBDailyMenu.findOne({
                        vendorId: sub.vendorId,
                        mealPlanId: planId,
                        date: dayStart
                    });
                    if (!dailyMenuItem) {
                        dailyMenuItem = await DMBDailyMenu.findOne({
                            vendorId: sub.vendorId,
                            date: dayStart
                        });
                    }
                    if (dailyMenuItem && dailyMenuItem.dishName) {
                        displayName = dailyMenuItem.dishName;
                    }
                } catch (e) {
                    logger.warn(`Error resolving daily menu for daily order: ${e.message}`);
                }

                mealsSnapshot.push({
                    mealPlanId: planId,
                    name: displayName,
                    quantity: m.quantity || 1
                });
            }

            const totalPrice = (sub.meals || []).reduce((acc, m) => {
                const pricePerDay = m.mealPlanId?.pricePerDay || 0;
                return acc + (pricePerDay * (m.quantity || 1));
            }, 0) || sub.pricing?.basePricePerDay || 0;

            await DMBDailyOrder.create({
                subscriptionId: sub._id,
                userId: sub.userId,
                vendorId: sub.vendorId,
                meals: mealsSnapshot,
                deliveryDate: dayStart,
                deliverySlot: sub.deliverySlot,
                status: 'scheduled',
                pricing: { totalPrice, currency: 'INR' },
                deliveryAddress: sub.deliveryAddress
            });

            created++;
        } catch (err) {
            logger.warn(`Failed to generate daily order for sub ${sub._id}: ${err.message}`);
        }
    }

    logger.info(`Daily orders for ${dateStr(targetDate)}: created=${created}, skipped=${skipped}`);
    return { created, skipped, date: dateStr(targetDate) };
};

/**
 * Ensure next 14 days of orders exist for a specific user.
 * Called lazily when the customer opens HomeScreen / OrdersScreen.
 * Generates orders for ALL upcoming days so vendor-scheduled meals appear.
 */
export const ensureOrdersForUser = async (userId) => {
    const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js').catch(() => ({ DMBDailyMenu: null }));

    // Get active subscriptions for this user
    const subs = await DMBSubscription.find({ userId, status: 'active' })
        .populate('meals.mealPlanId', 'name pricePerDay')
        .lean();

    const today = toDateOnly(new Date());
    const tomorrow = toDateOnly(new Date(Date.now() + 86400000));

    for (const sub of subs) {
        // Collect all target dates to ensure orders exist.
        // We always ensure today and tomorrow.
        const targetDates = [today, tomorrow];

        // Also query DMBDailyMenu for any upcoming customized menus from this vendor
        if (DMBDailyMenu) {
            try {
                const upcomingCustomMenus = await DMBDailyMenu.find({
                    vendorId: sub.vendorId,
                    date: { $gte: today }
                }).lean();
                for (const menu of upcomingCustomMenus) {
                    const menuDate = toDateOnly(menu.date);
                    if (!targetDates.some(d => d.getTime() === menuDate.getTime())) {
                        targetDates.push(menuDate);
                    }
                }
            } catch (err) {
                logger.warn(`ensureOrdersForUser custom menu query failed: ${err.message}`);
            }
        }

        // Now ensure order exists for each target date
        for (const targetDate of targetDates) {
            const dayStart = toDateOnly(targetDate);
            const dayEnd = new Date(dayStart);
            dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

            const dayOfWeek = dayStart.getUTCDay();
            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
            // Skip days not in subscription's delivery schedule
            if (sub.deliveryDays === 'mon_fri' && !isWeekday) continue;
            if (dayOfWeek === 0) continue; // Always skip Sunday

            const existing = await DMBDailyOrder.findOne({
                subscriptionId: sub._id,
                deliveryDate: { $gte: dayStart, $lt: dayEnd }
            });

            if (!existing) {
                // Create new order for this day
                const mealsSnapshot = [];
                for (const m of (sub.meals || [])) {
                    const planId = m.mealPlanId?._id || m.mealPlanId;
                    let displayName = m.mealPlanId?.name || 'Meal';

                    try {
                        if (DMBDailyMenu) {
                            let dailyMenuItem = await DMBDailyMenu.findOne({
                                vendorId: sub.vendorId,
                                mealPlanId: planId,
                                date: dayStart
                            }).lean();
                            if (!dailyMenuItem) {
                                dailyMenuItem = await DMBDailyMenu.findOne({
                                    vendorId: sub.vendorId,
                                    date: dayStart
                                }).lean();
                            }
                            if (dailyMenuItem?.dishName) {
                                displayName = dailyMenuItem.dishName;
                            }
                        }
                    } catch (e) {}

                    mealsSnapshot.push({
                        mealPlanId: planId,
                        name: displayName,
                        quantity: m.quantity || 1
                    });
                }

                const totalPrice = (sub.meals || []).reduce((acc, m) => {
                    return acc + ((m.mealPlanId?.pricePerDay || 0) * (m.quantity || 1));
                }, 0) || sub.pricing?.basePricePerDay || 0;

                await DMBDailyOrder.create({
                    subscriptionId: sub._id,
                    userId: sub.userId,
                    vendorId: sub.vendorId,
                    meals: mealsSnapshot,
                    deliveryDate: dayStart,
                    deliverySlot: sub.deliverySlot,
                    status: 'scheduled',
                    pricing: { totalPrice, currency: 'INR' },
                    deliveryAddress: sub.deliveryAddress
                }).catch(e => logger.warn(`ensureOrdersForUser: ${e.message}`));
            }
        }
    }
};

/**
 * Get today's and tomorrow's meal info for a customer (HomeScreen card)
 * Always fetches fresh dishName from DMBDailyMenu so vendor changes reflect immediately.
 */
export const getTodayAndTomorrowMeals = async (userId) => {
    await ensureOrdersForUser(userId);

    const today = toDateOnly(new Date());
    const tomorrow = toDateOnly(new Date(Date.now() + 86400000));
    const dayAfterTomorrow = toDateOnly(new Date(Date.now() + 2 * 86400000));

    // Fetch as mutable documents (NOT lean) so we can update + save if name changed
    const orderDocs = await DMBDailyOrder.find({
        userId,
        deliveryDate: { $gte: today, $lt: dayAfterTomorrow },
        status: { $nin: ['failed'] }
    }).sort({ deliveryDate: 1 });

    // Refresh meal names from latest DMBDailyMenu for each order
    for (const order of orderDocs) {
        let dirty = false;
        if (!order.deliveryPin) {
            order.deliveryPin = String(Math.floor(1000 + Math.random() * 9000));
            dirty = true;
        }
        await refreshMealNameFromDailyMenu(order);
        if (dirty) {
            await order.save().catch(err => logger.error(`Error saving generated deliveryPin: ${err.message}`));
        }
    }

    // Now populate for formatting
    const orders = await DMBDailyOrder.find({
        userId,
        deliveryDate: { $gte: today, $lt: dayAfterTomorrow },
        status: { $nin: ['failed'] }
    })
        .populate('vendorId', 'restaurantName profileImage city')
        .populate('meals.mealPlanId', 'name photos pricePerDay nutrition')
        .sort({ deliveryDate: 1 })
        .lean();

    // Attach custom photo, nutrition, description
    await attachDailyMenuDetails(orders);

    const todayOrders = orders.filter(o =>
        new Date(o.deliveryDate).getTime() === today.getTime()
    );
    const tomorrowOrders = orders.filter(o =>
        new Date(o.deliveryDate).getTime() === tomorrow.getTime()
    );

    return {
        today: todayOrders.length > 0 ? formatOrderCard(todayOrders[0]) : null,
        tomorrow: tomorrowOrders.length > 0 ? formatOrderCard(tomorrowOrders[0]) : null
    };
};

/**
 * Get upcoming + past orders for a customer (OrdersScreen)
 * For upcoming orders, always refreshes dishName from DMBDailyMenu.
 */
export const getCustomerOrders = async (userId, { type = 'upcoming' } = {}) => {
    await ensureOrdersForUser(userId);

    const today = toDateOnly(new Date());

    const filter = { userId };
    if (type === 'upcoming') {
        filter.deliveryDate = { $gte: today };
        filter.status = { $nin: ['delivered', 'failed'] };
    } else {
        filter.$or = [
            { deliveryDate: { $lt: today } },
            { status: { $in: ['delivered', 'failed'] } }
        ];
    }

    // For upcoming orders: refresh meal names from DMBDailyMenu first
    if (type === 'upcoming') {
        const orderDocs = await DMBDailyOrder.find(filter)
            .sort({ deliveryDate: 1 })
            .limit(50);
        for (const order of orderDocs) {
            let dirty = false;
            if (!order.deliveryPin) {
                order.deliveryPin = String(Math.floor(1000 + Math.random() * 9000));
                dirty = true;
            }
            await refreshMealNameFromDailyMenu(order);
            if (dirty) {
                await order.save().catch(err => logger.error(`Error saving generated deliveryPin: ${err.message}`));
            }
        }
    }

    const orders = await DMBDailyOrder.find(filter)
        .populate('vendorId', 'restaurantName profileImage city')
        .populate('meals.mealPlanId', 'name photos pricePerDay nutrition')
        .sort(type === 'upcoming' ? { deliveryDate: 1 } : { deliveryDate: -1 })
        .limit(50)
        .lean();

    // Attach custom photo, nutrition, description
    await attachDailyMenuDetails(orders);

    // Resolve order status dynamically before returning
    const mappedOrders = orders.map(order => {
        let status = order.status;
        const deliveryDateOnly = toDateOnly(order.deliveryDate);
        if (deliveryDateOnly < today) {
            if (status !== 'delivered' && status !== 'skipped' && status !== 'failed') {
                status = 'failed';
            }
        }
        return {
            ...order,
            status
        };
    });

    return mappedOrders.map(formatOrderCard);
};

/**
 * Get vendor's daily orders (Vendor OrdersManager)
 */
export const getVendorDailyOrders = async (vendorId, { date, slot } = {}) => {
    const targetDate = date ? toDateOnly(new Date(date)) : toDateOnly(new Date());
    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const filter = {
        vendorId,
        deliveryDate: { $gte: targetDate, $lt: nextDay }
    };
    if (slot) filter.deliverySlot = slot;

    const orders = await DMBDailyOrder.find(filter)
        .populate('userId', 'name phone')
        .populate('meals.mealPlanId', 'name photos pricePerDay nutrition')
        .sort({ deliverySlot: 1, createdAt: 1 })
        .lean();

    // Attach custom photo, nutrition, description
    await attachDailyMenuDetails(orders);

    return orders.map(o => ({
        _id: o._id,
        orderId: o.orderId,
        status: o.status,
        deliverySlot: o.deliverySlot,
        deliveryDate: o.deliveryDate,
        customer: {
            name: o.userId?.name || 'Customer',
            phone: o.userId?.phone || ''
        },
        meals: o.meals.map(m => ({
            name: m.name || m.mealPlanId?.name || 'Meal',
            quantity: m.quantity,
            photo: m.customPhoto || m.mealPlanId?.photos?.[0] || null,
            nutrition: m.customNutrition || m.mealPlanId?.nutrition || null,
            description: m.customDescription || m.mealPlanId?.description || ''
        })),
        pricing: o.pricing,
        deliveryAddress: o.deliveryAddress,
        collectionPin: o.collectionPin
    }));
};

/**
 * Vendor updates order status → broadcasts via Socket.IO to customer
 */
export const updateDailyOrderStatus = async (orderId, status, vendorId) => {
    const validTransitions = {
        scheduled: ['preparing', 'skipped'],
        preparing: ['ready'],
        ready: ['out_for_delivery'],
        out_for_delivery: ['delivered'],
        delivered: [],
        skipped: [],
        failed: []
    };

    const order = await DMBDailyOrder.findOne({ _id: orderId, vendorId });
    if (!order) throw new Error('Order not found or not authorized');

    const allowed = validTransitions[order.status] || [];
    if (!allowed.includes(status)) {
        throw new Error(`Cannot transition from ${order.status} to ${status}`);
    }

    // Set timestamps
    if (status === 'preparing') order.preparingAt = new Date();
    if (status === 'ready') order.readyAt = new Date();
    if (status === 'out_for_delivery') order.pickedUpAt = new Date();
    if (status === 'delivered') order.deliveredAt = new Date();

    order.status = status;
    await order.save();

    // Real-time: emit to customer's subscription room
    const io = getIO();
    if (io) {
        const roomName = `sub_${order.subscriptionId}`;
        io.to(roomName).emit('order_status_updated', {
            orderId: order.orderId,
            _id: order._id,
            status: order.status,
            deliveryDate: order.deliveryDate,
            deliverySlot: order.deliverySlot,
            updatedAt: new Date().toISOString()
        });
        logger.info(`Socket emitted order_status_updated to room ${roomName}: ${status}`);
    }

    logger.info(`DMB order ${order.orderId} status → ${status} by vendor ${vendorId}`);
    return order;
};

/**
 * Batch: Vendor marks all orders for a slot as "ready"
 */
export const markAllOrdersReady = async (vendorId, { date, slot }) => {
    const targetDate = toDateOnly(date ? new Date(date) : new Date());
    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const filter = {
        vendorId,
        deliveryDate: { $gte: targetDate, $lt: nextDay },
        status: { $in: ['scheduled', 'preparing'] }
    };
    if (slot) filter.deliverySlot = slot;

    const orders = await DMBDailyOrder.find(filter);
    if (orders.length === 0) {
        return { count: 0, date: dateStr(targetDate), slot, message: 'No pending orders found' };
    }

    const io = getIO();
    let count = 0;

    for (const order of orders) {
        order.status = 'ready';
        order.readyAt = new Date();
        await order.save();
        count++;

        // Notify each subscriber
        if (io) {
            io.to(`sub_${order.subscriptionId}`).emit('order_status_updated', {
                orderId: order.orderId,
                _id: order._id,
                status: 'ready',
                deliveryDate: order.deliveryDate,
                deliverySlot: order.deliverySlot,
                updatedAt: new Date().toISOString()
            });
        }
    }

    // --- Broadcast to nearby delivery partners ---
    try {
        const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName location zoneId serviceZone city');
        
        const vendorZoneId = vendor?.zoneId || vendor?.serviceZone;
        const vendorCity = vendor?.city || vendor?.location?.city;

        // Build driver filter: zone match OR city match (fallback)
        const driverFilter = {
            availabilityStatus: 'online',
            status: 'approved',
        };

        if (vendorZoneId) {
            driverFilter.$or = [
                { zoneIds: vendorZoneId },
                { city: { $regex: new RegExp(`^${vendorCity}$`, 'i') } }
            ];
        } else if (vendorCity) {
            // No zone configured: fallback to city-only match
            driverFilter.city = { $regex: new RegExp(`^${vendorCity}$`, 'i') };
        } else {
            logger.warn(`Vendor ${vendorId} has no zoneId or city configured. Cannot broadcast.`);
            return { count, date: dateStr(targetDate), slot };
        }

        // Create an unassigned CollectionBatch for these orders
        const batch = await CollectionBatch.create({
            vendorId,
            deliveryDate: targetDate,
            deliverySlot: slot || 'lunch',
            boxCount: orders.length,
            orderIds: orders.map(o => o._id),
            status: 'pending'
        });

        // Find online drivers in this zone/city
        const onlineDrivers = await FoodDeliveryPartner.find(driverFilter).select('_id fcmTokens socketRoomId');

        logger.info(`Vendor ${vendorId} broadcast query matched ${onlineDrivers.length} online drivers (filter: ${JSON.stringify(driverFilter)})`);

        if (io && onlineDrivers.length > 0) {
            const payload = {
                batchId: batch.batchId,
                vendorId: vendor._id,
                vendorName: vendor.restaurantName,
                vendorLocation: vendor.location,
                boxCount: orders.length,
                slot: slot || 'lunch',
                totalOrders: orders.length,
            };

            // Broadcast to all matched online drivers
            onlineDrivers.forEach(driver => {
                const roomName = `delivery:${driver._id.toString()}`;
                io.to(roomName).emit('new_delivery_request', payload);
            });
            
            logger.info(`Vendor ${vendorId} batch ${batch.batchId} broadcasted to ${onlineDrivers.length} drivers`);
        } else if (onlineDrivers.length === 0) {
            logger.warn(`No online+approved drivers found for vendor ${vendorId} in city "${vendorCity}" / zone "${vendorZoneId}"`);
        }
    } catch (err) {
        logger.error(`Error broadcasting delivery request for vendor ${vendorId}: ${err.message}`);
    }

    logger.info(`Vendor ${vendorId} marked ${count} orders as ready for ${dateStr(targetDate)} / ${slot}`);
    return { count, date: dateStr(targetDate), slot };
};

// ─── Internal Formatter ────────────────────────────────────────────────────
// Priority: m.name (vendor-set custom dishName) > mealPlanId.name (default plan name)
const formatOrderCard = (order) => ({
    _id: order._id,
    orderId: order.orderId,
    status: order.status,
    deliveryDate: order.deliveryDate,
    deliverySlot: order.deliverySlot,
    vendor: {
        name: order.vendorId?.restaurantName || 'Vendor',
        image: order.vendorId?.profileImage || null,
        city: order.vendorId?.city || ''
    },
    meals: (order.meals || []).map(m => ({
        // ✅ FIX: m.name (custom dishName from vendor) FIRST, then default plan name
        name: m.name || m.mealPlanId?.name || 'Meal',
        photo: m.customPhoto || m.mealPlanId?.photos?.[0] || null,
        nutrition: m.customNutrition || m.mealPlanId?.nutrition || null,
        description: m.customDescription || m.mealPlanId?.description || '',
        quantity: m.quantity
    })),
    pricing: order.pricing,
    subscriptionId: order.subscriptionId,
    deliveryPin: order.deliveryPin || '',
    deliveryAddress: order.deliveryAddress
});
