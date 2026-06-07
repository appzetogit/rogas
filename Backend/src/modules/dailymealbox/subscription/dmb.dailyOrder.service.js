import { DMBDailyOrder } from './dmb.dailyOrder.model.js';
import { DMBSubscription } from './subscription.model.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { getIO } from '../../../config/socket.js';
import { logger } from '../../../utils/logger.js';

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
            const mealsSnapshot = (sub.meals || []).map(m => ({
                mealPlanId: m.mealPlanId?._id || m.mealPlanId,
                name: m.mealPlanId?.name || 'Meal',
                quantity: m.quantity || 1
            }));

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
 * Ensure today's and tomorrow's orders exist for a specific user.
 * Called lazily when the customer opens HomeScreen / OrdersScreen.
 */
export const ensureOrdersForUser = async (userId) => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get active subscriptions for this user
    const subs = await DMBSubscription.find({ userId, status: 'active' })
        .populate('meals.mealPlanId', 'name pricePerDay')
        .lean();

    for (const sub of subs) {
        for (const targetDate of [today, tomorrow]) {
            const dayStart = toDateOnly(targetDate);
            const dayEnd = new Date(dayStart);
            dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

            const dayOfWeek = dayStart.getUTCDay();
            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
            if (sub.deliveryDays === 'mon_fri' && !isWeekday) continue;

            const existing = await DMBDailyOrder.findOne({
                subscriptionId: sub._id,
                deliveryDate: { $gte: dayStart, $lt: dayEnd }
            });

            if (!existing) {
                const mealsSnapshot = (sub.meals || []).map(m => ({
                    mealPlanId: m.mealPlanId?._id || m.mealPlanId,
                    name: m.mealPlanId?.name || 'Meal',
                    quantity: m.quantity || 1
                }));

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
 */
export const getTodayAndTomorrowMeals = async (userId) => {
    await ensureOrdersForUser(userId);

    const today = toDateOnly(new Date());
    const tomorrow = toDateOnly(new Date(Date.now() + 86400000));
    const dayAfterTomorrow = toDateOnly(new Date(Date.now() + 2 * 86400000));

    const orders = await DMBDailyOrder.find({
        userId,
        deliveryDate: { $gte: today, $lt: dayAfterTomorrow },
        status: { $nin: ['skipped', 'failed'] }
    })
        .populate('vendorId', 'restaurantName profileImage city')
        .populate('meals.mealPlanId', 'name photos pricePerDay nutrition')
        .sort({ deliveryDate: 1 })
        .lean();

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
 */
export const getCustomerOrders = async (userId, { type = 'upcoming' } = {}) => {
    await ensureOrdersForUser(userId);

    const today = toDateOnly(new Date());

    const filter = { userId };
    if (type === 'upcoming') {
        filter.deliveryDate = { $gte: today };
        filter.status = { $nin: ['delivered', 'failed'] };
    } else {
        filter.deliveryDate = { $lt: today };
    }

    const orders = await DMBDailyOrder.find(filter)
        .populate('vendorId', 'restaurantName profileImage city')
        .populate('meals.mealPlanId', 'name photos pricePerDay')
        .sort(type === 'upcoming' ? { deliveryDate: 1 } : { deliveryDate: -1 })
        .limit(50)
        .lean();

    return orders.map(formatOrderCard);
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
        .populate('meals.mealPlanId', 'name photos pricePerDay')
        .sort({ deliverySlot: 1, createdAt: 1 })
        .lean();

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
            name: m.mealPlanId?.name || m.name || 'Meal',
            quantity: m.quantity,
            photo: m.mealPlanId?.photos?.[0] || null
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

    logger.info(`Vendor ${vendorId} marked ${count} orders as ready for ${dateStr(targetDate)} / ${slot}`);
    return { count, date: dateStr(targetDate), slot };
};

// ─── Internal Formatter ────────────────────────────────────────────────────
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
        name: m.mealPlanId?.name || m.name || 'Meal',
        photo: m.mealPlanId?.photos?.[0] || null,
        quantity: m.quantity
    })),
    pricing: order.pricing,
    subscriptionId: order.subscriptionId
});
