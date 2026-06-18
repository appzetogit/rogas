import { DMBSubscription } from './subscription.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { FoodOrder } from '../../food/orders/models/order.model.js';
import { sendNotificationToUser } from '../../../core/notifications/notification.service.js';
import { logger } from '../../../utils/logger.js';
import { getIO } from '../../../config/socket.js';

// ─── Helpers ───────────────────────────────────────────────────────────────
const toDateOnly = (date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

const getNextValidDeliveryDate = (date, deliveryDays) => {
    let current = new Date(date);
    while (true) {
        const dayOfWeek = current.getUTCDay();
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const isSunday = dayOfWeek === 0;
        
        let isValid = true;
        if (deliveryDays === 'mon_fri' && !isWeekday) isValid = false;
        if (isSunday && deliveryDays !== 'full_week') isValid = false;
        
        if (isValid) {
            return current;
        }
        current.setUTCDate(current.getUTCDate() + 1);
    }
};

/**
 * Subscription Service — DailyMealBox
 * Handles: create, skip, pause, resume, cancel, swap-meal, auto-resume
 * PRD Reference: CA-07, CA-12, CA-15, ACM-13, ACM-14, ACM-15
 */

// ─── Create Subscription ───────────────────────────────────────────────────
export const createSubscription = async ({
    userId,
    vendorId,
    zoneId,
    mealPlanId,
    meals,
    duration,
    deliveryDays,
    deliverySlot,
    deliverySlots,
    deliveryAddress,
    pricing,
    paymentMethod,
    invoiceType,
    companyNip,
    companyName,
    billingEmail
}) => {
    // Check if customer already has an active or paused subscription
    const existingActive = await DMBSubscription.findOne({
        userId,
        status: { $in: ['active', 'paused'] }
    });
    if (existingActive) {
        throw new Error('You already have an active or paused subscription plan.');
    }

    // Start date = always the day after purchase date, normalized to midnight
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);

    // Map single mealPlanId to meals array if sent (for backward compatibility)
    let finalMeals = meals;
    if (!finalMeals && mealPlanId) {
        finalMeals = [{ mealPlanId, quantity: 1 }];
    }

    // Normalize deliveryAddress
    let finalAddress = deliveryAddress;
    if (typeof deliveryAddress === 'object' && deliveryAddress.location) {
        finalAddress = {
            street: deliveryAddress.street || deliveryAddress.address || '',
            city: deliveryAddress.city || 'Local',
            state: deliveryAddress.state || 'Local',
            label: deliveryAddress.label || 'Home',
            location: deliveryAddress.location
        };
    } else if (typeof deliveryAddress === 'string') {
        const parts = deliveryAddress.split(',').map(p => p.trim());
        let city = 'Local';
        let state = 'Local';
        if (parts.length >= 3) {
            city = parts[parts.length - 2];
            state = parts[parts.length - 1].replace(/\d/g, '').replace(/[-–]/g, '').trim();
        } else if (parts.length === 2) {
            city = parts[0];
            state = parts[1].replace(/\d/g, '').replace(/[-–]/g, '').trim();
        } else {
            city = deliveryAddress;
        }
        finalAddress = {
            street: deliveryAddress,
            city: city || 'Local',
            state: state || 'Local',
            label: 'Home'
        };
    }

    const finalSlots = deliverySlots && deliverySlots.length > 0
        ? deliverySlots
        : (deliverySlot ? [deliverySlot] : []);
    const finalSlot = deliverySlot || (finalSlots.length > 0 ? finalSlots[0] : 'lunch');

    const finalPricing = {
        basePricePerDay: pricing?.basePricePerDay || 0,
        deliveryFeePerDay: pricing?.deliveryFeePerDay || 0,
        foodVat: pricing?.foodVat || 0,
        deliveryVat: pricing?.deliveryVat || 0,
        platformFee: pricing?.platformFee || 0,
        foodVatAmount: pricing?.foodVatAmount || 0,
        deliveryVatAmount: pricing?.deliveryVatAmount || 0,
        platformFeeAmount: pricing?.platformFeeAmount || 0,
        applyFoodVatOnMenu: pricing?.applyFoodVatOnMenu === true || pricing?.applyFoodVatOnMenu === 'true',
        totalPerWeek: pricing?.totalPerWeek || 0,
        totalPrice: pricing?.totalPrice || 0,
        currency: pricing?.currency || 'INR'
    };

    // Calculate initial endDate
    const endDate = new Date(startDate);
    if (duration === 'weekly') {
        endDate.setDate(startDate.getDate() + 7);
    } else if (duration === 'monthly') {
        endDate.setDate(startDate.getDate() + 30);
    } else if (duration === 'one_day') {
        endDate.setDate(startDate.getDate() + 1);
    } else {
        endDate.setDate(startDate.getDate() + 7);
    }
    endDate.setHours(0, 0, 0, 0);

    const subscription = await DMBSubscription.create({
        userId,
        vendorId,
        zoneId: zoneId || undefined,
        mealPlanId: mealPlanId || undefined,
        meals: finalMeals || [],
        duration: duration || 'weekly',
        startDate,
        endDate,
        nextDeliveryDate: startDate,
        deliveryDays,
        deliverySlot: finalSlot,
        deliverySlots: finalSlots,
        deliveryAddress: finalAddress,
        pricing: finalPricing,
        paymentMethod: paymentMethod || 'razorpay',
        invoiceType: invoiceType === 'vat' ? 'b2b_vat' : (invoiceType === 'simple' ? 'receipt' : (invoiceType || 'receipt')),
        companyNip,
        companyName,
        billingEmail,
        status: 'pending_payment',
        billingCycleStart: startDate
    });

    // Update user subscription status (denormalized)
    await FoodUser.findByIdAndUpdate(userId, { subscriptionStatus: 'active' });

    logger.info(`Subscription created: ${subscription.subscriptionId} for user ${userId}`);
    return subscription;
};

// ─── Activate Subscription (after payment confirmed) ───────────────────────
export const activateSubscription = async (subscriptionId) => {
    const sub = await DMBSubscription.findOneAndUpdate(
        { subscriptionId },
        { status: 'active' },
        { new: true }
    );
    if (!sub) throw new Error('Subscription not found');

    // Notify vendor: new subscriber
    await sendNotificationToUser({
        recipientId: sub.vendorId,
        recipientType: 'vendor',
        title: 'New Subscriber! 🎉',
        body: `A new customer subscribed to your meal plan.`,
        data: { screen: 'subscribers', event: 'new_subscriber', subscriptionId }
    });

    return sub;
};

// ─── Skip Delivery (PRD ACM-13) ────────────────────────────────────────────
export const skipDelivery = async ({ subscriptionId, userId, skipDate, reason }) => {
    const sub = await DMBSubscription.findOne({ subscriptionId, userId });
    if (!sub) throw new Error('Subscription not found');
    if (sub.status !== 'active') throw new Error('Only active subscriptions can be skipped');

    // Check monthly skip limit
    const currentMonthKey = getMonthKey();
    if (sub.skipsMonthKey !== currentMonthKey) {
        // Reset skip count for new month
        sub.skipsMonthKey = currentMonthKey;
        sub.skipsUsedThisMonth = 0;
    }

    if (sub.skipsUsedThisMonth >= sub.maxSkipsPerMonth) {
        throw new Error(`Skip limit reached: ${sub.maxSkipsPerMonth} skips per month`);
    }

    // Check cutoff hasn't passed for the skip date
    // TODO: implement cutoff check with vendor settings

    sub.skipsUsedThisMonth += 1;
    await sub.save();

    // Credit wallet for skipped day
    const slotCount = sub.deliverySlots && sub.deliverySlots.length > 0 ? sub.deliverySlots.length : 1;
    const creditAmount = sub.pricing.basePricePerDay * slotCount;
    await FoodUser.findByIdAndUpdate(userId, {
        $inc: { walletBalance: creditAmount }
    });

    // Notify vendor to reduce prep count
    await sendNotificationToUser({
        recipientId: sub.vendorId,
        recipientType: 'vendor',
        title: 'Customer Skip',
        body: `A customer skipped tomorrow's delivery. Update your preparation count.`,
        data: { screen: 'orders', event: 'subscriber_skip', subscriptionId, skipDate }
    });

    logger.info(`Skip recorded: ${subscriptionId} on ${skipDate}, wallet credited ${creditAmount}`);
    return { skipsUsed: sub.skipsUsedThisMonth, maxSkips: sub.maxSkipsPerMonth, walletCredited: creditAmount };
};

// ─── Pause Subscription (PRD ACM-14) ──────────────────────────────────────
export const pauseSubscription = async ({ subscriptionId, userId, pauseDays, reason }) => {
    const sub = await DMBSubscription.findOne({ subscriptionId, userId });
    if (!sub) throw new Error('Subscription not found');
    if (sub.status !== 'active') throw new Error('Only active subscriptions can be paused');

    const maxPauseDays = sub.maxPauseDays || 2;
    if (pauseDays > maxPauseDays) {
        throw new Error(`Max pause duration is ${maxPauseDays} days`);
    }

    const today = toDateOnly(new Date());

    // ── Remaining days guard ──────────────────────────────────────────────
    let currentEndDate = sub.endDate;
    if (!currentEndDate) {
        const start = new Date(sub.startDate);
        currentEndDate = new Date(start);
        if (sub.duration === 'weekly') {
            currentEndDate.setDate(start.getDate() + 7);
        } else if (sub.duration === 'monthly') {
            currentEndDate.setDate(start.getDate() + 30);
        } else if (sub.duration === 'one_day') {
            currentEndDate.setDate(start.getDate() + 1);
        } else {
            currentEndDate.setDate(start.getDate() + 7);
        }
    }
    const endDateNorm = toDateOnly(currentEndDate);
    const remainingDays = Math.round((endDateNorm.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    if (remainingDays <= 1) {
        throw new Error('Cannot pause: your subscription has only 1 day remaining.');
    }
    if (pauseDays >= remainingDays) {
        throw new Error(`You can only pause for up to ${remainingDays - 1} day(s) since your subscription has ${remainingDays} day(s) remaining.`);
    }
    // ─────────────────────────────────────────────────────────────────────
    const pauseUntil = new Date(today);
    pauseUntil.setUTCDate(today.getUTCDate() + 1 + pauseDays);

    // Extend endDate by pauseDays (currentEndDate already resolved above)
    const newEndDate = new Date(currentEndDate);
    newEndDate.setUTCDate(newEndDate.getUTCDate() + pauseDays);
    sub.endDate = newEndDate;

    sub.status = 'paused';
    sub.pausedUntil = pauseUntil;
    sub.pausedAt = today;
    sub.requestedPauseDays = pauseDays;
    sub.pauseReason = reason || '';
    await sub.save();

    // Update user status
    await FoodUser.findByIdAndUpdate(userId, { subscriptionStatus: 'paused' });

    // Shift upcoming scheduled daily orders
    const { DMBDailyOrder } = await import('./dmb.dailyOrder.model.js');
    const tomorrow = toDateOnly(new Date());
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const upcomingOrders = await DMBDailyOrder.find({
        subscriptionId: sub._id,
        deliveryDate: { $gte: tomorrow },
        status: 'scheduled'
    }).sort({ deliveryDate: 1 });

    // Group by deliveryDate to handle multiple slots per day
    const ordersByDate = {};
    for (const order of upcomingOrders) {
        const dateKey = toDateOnly(order.deliveryDate).getTime();
        if (!ordersByDate[dateKey]) {
            ordersByDate[dateKey] = [];
        }
        ordersByDate[dateKey].push(order);
    }

    const sortedDateKeys = Object.keys(ordersByDate).map(Number).sort((a, b) => a - b);
    let lastAllocatedDate = null;
    const ioUpdates = [];

    for (const dateKey of sortedDateKeys) {
        const originalDate = new Date(dateKey);
        let newDate = new Date(originalDate);
        newDate.setUTCDate(newDate.getUTCDate() + pauseDays);

        if (lastAllocatedDate && newDate <= lastAllocatedDate) {
            newDate = new Date(lastAllocatedDate);
            newDate.setUTCDate(newDate.getUTCDate() + 1);
        }

        newDate = getNextValidDeliveryDate(newDate, sub.deliveryDays);

        while (lastAllocatedDate && newDate <= lastAllocatedDate) {
            newDate.setUTCDate(newDate.getUTCDate() + 1);
            newDate = getNextValidDeliveryDate(newDate, sub.deliveryDays);
        }

        for (const order of ordersByDate[dateKey]) {
            order.deliveryDate = newDate;
            await order.save();

            ioUpdates.push({
                orderId: order.orderId,
                _id: order._id,
                status: order.status,
                deliveryDate: newDate,
                deliverySlot: order.deliverySlot,
                updatedAt: new Date().toISOString()
            });
        }

        lastAllocatedDate = newDate;
    }

    // Emit Socket.IO updates
    try {
        const io = getIO();
        if (io) {
            io.to(`sub_${sub._id}`).emit('subscription_paused', {
                subscriptionId: sub.subscriptionId,
                status: sub.status,
                pausedUntil: sub.pausedUntil,
                endDate: sub.endDate
            });
            io.to(`vendor_${sub.vendorId}`).emit('subscriber_paused', {
                subscriptionId: sub.subscriptionId,
                pausedUntil: sub.pausedUntil
            });
            // Emit order updates
            for (const payload of ioUpdates) {
                io.to(`sub_${sub._id}`).emit('order_status_updated', payload);
                io.to(`vendor_${sub.vendorId}`).emit('order_status_update', payload);
            }
        }
    } catch (err) {
        logger.warn(`Failed to broadcast pause sockets: ${err.message}`);
    }

    logger.info(`Subscription paused: ${subscriptionId} until ${pauseUntil}`);
    return { pausedUntil: pauseUntil };
};

// ─── Resume Subscription ───────────────────────────────────────────────────
export const resumeSubscription = async (subscriptionId) => {
    const sub = await DMBSubscription.findOne({ subscriptionId, status: 'paused' });
    if (!sub) return null;

    const now = toDateOnly(new Date());
    const pausedAt = sub.pausedAt ? toDateOnly(sub.pausedAt) : now;
    const requestedPauseDays = sub.requestedPauseDays || 0;

    // Calculate actual days paused
    const actualDays = Math.max(0, Math.round((now.getTime() - pausedAt.getTime()) / (24 * 60 * 60 * 1000)));
    const refundDays = requestedPauseDays - actualDays;

    const ioUpdates = [];

    if (refundDays > 0) {
        // Adjust endDate
        if (sub.endDate) {
            const newEndDate = new Date(sub.endDate);
            newEndDate.setUTCDate(newEndDate.getUTCDate() - refundDays);
            sub.endDate = newEndDate;
        }

        // Shift future orders back
        const { DMBDailyOrder } = await import('./dmb.dailyOrder.model.js');
        const tomorrow = toDateOnly(new Date());
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

        const upcomingOrders = await DMBDailyOrder.find({
            subscriptionId: sub._id,
            deliveryDate: { $gte: tomorrow },
            status: 'scheduled'
        }).sort({ deliveryDate: 1 });

        // Group by deliveryDate to handle multiple slots per day
        const ordersByDate = {};
        for (const order of upcomingOrders) {
            const dateKey = toDateOnly(order.deliveryDate).getTime();
            if (!ordersByDate[dateKey]) {
                ordersByDate[dateKey] = [];
            }
            ordersByDate[dateKey].push(order);
        }

        const sortedDateKeys = Object.keys(ordersByDate).map(Number).sort((a, b) => a - b);
        let lastAllocatedDate = null;

        for (const dateKey of sortedDateKeys) {
            const originalDate = new Date(dateKey);
            let newDate = new Date(originalDate);
            newDate.setUTCDate(newDate.getUTCDate() - refundDays);

            // Ensure we don't shift to today or past
            if (newDate < tomorrow) {
                newDate = new Date(tomorrow);
            }

            if (lastAllocatedDate && newDate <= lastAllocatedDate) {
                newDate = new Date(lastAllocatedDate);
                newDate.setUTCDate(newDate.getUTCDate() + 1);
            }

            newDate = getNextValidDeliveryDate(newDate, sub.deliveryDays);

            while (lastAllocatedDate && newDate <= lastAllocatedDate) {
                newDate.setUTCDate(newDate.getUTCDate() + 1);
                newDate = getNextValidDeliveryDate(newDate, sub.deliveryDays);
            }

            for (const order of ordersByDate[dateKey]) {
                order.deliveryDate = newDate;
                await order.save();

                ioUpdates.push({
                    orderId: order.orderId,
                    _id: order._id,
                    status: order.status,
                    deliveryDate: newDate,
                    deliverySlot: order.deliverySlot,
                    updatedAt: new Date().toISOString()
                });
            }

            lastAllocatedDate = newDate;
        }
    }

    sub.status = 'active';
    sub.pausedUntil = null;
    sub.pausedAt = null;
    sub.requestedPauseDays = 0;
    sub.pauseReason = '';
    await sub.save();

    await FoodUser.findByIdAndUpdate(sub.userId, { subscriptionStatus: 'active' });

    // Immediately regenerate/restore upcoming meals/daily orders
    try {
        const { ensureOrdersForUser } = await import('./dmb.dailyOrder.service.js');
        await ensureOrdersForUser(sub.userId);
    } catch (err) {
        logger.warn(`Failed to immediately generate orders on resume: ${err.message}`);
    }

    // Emit Socket.IO updates
    try {
        const io = getIO();
        if (io) {
            io.to(`sub_${sub._id}`).emit('subscription_resumed', {
                subscriptionId: sub.subscriptionId,
                status: sub.status,
                endDate: sub.endDate
            });
            io.to(`vendor_${sub.vendorId}`).emit('subscriber_resumed', {
                subscriptionId: sub.subscriptionId
            });
            // Emit order updates
            for (const payload of ioUpdates) {
                io.to(`sub_${sub._id}`).emit('order_status_updated', payload);
                io.to(`vendor_${sub.vendorId}`).emit('order_status_update', payload);
            }
        }
    } catch (err) {
        logger.warn(`Failed to broadcast resume sockets: ${err.message}`);
    }

    logger.info(`Subscription resumed: ${subscriptionId}, actualDays paused: ${actualDays}, refundDays: ${refundDays}`);
    return sub;
};

// ─── Cancel Subscription (PRD ACM-15 — EU Law, max 2-tap) ─────────────────
export const cancelSubscription = async ({ subscriptionId, userId, reason }) => {
    const sub = await DMBSubscription.findOneAndUpdate(
        { subscriptionId, userId, status: { $in: ['active', 'paused'] } },
        { status: 'cancelled', cancelledAt: new Date(), cancellationReason: reason || '', autoRenew: false },
        { new: true }
    );
    if (!sub) throw new Error('Subscription not found or already cancelled');

    // Update user status
    const hasOtherActive = await DMBSubscription.exists({ userId, status: 'active', _id: { $ne: sub._id } });
    if (!hasOtherActive) {
        await FoodUser.findByIdAndUpdate(userId, { subscriptionStatus: 'cancelled' });
    }

    // Notify vendor
    await sendNotificationToUser({
        recipientId: sub.vendorId,
        recipientType: 'vendor',
        title: 'Subscriber Cancelled',
        body: `A subscriber cancelled. Check your analytics for retention tips.`,
        data: { screen: 'analytics', event: 'subscriber_cancelled', subscriptionId }
    });

    logger.info(`Subscription cancelled: ${subscriptionId} by user ${userId}`);
    return sub;
};

// ─── Auto-Resume CRON (runs daily) ────────────────────────────────────────
export const autoResumePausedSubscriptions = async () => {
    const now = new Date();
    const expiredPauses = await DMBSubscription.find({
        status: 'paused',
        pausedUntil: { $lte: now }
    });

    for (const sub of expiredPauses) {
        await resumeSubscription(sub.subscriptionId);
    }

    logger.info(`Auto-resumed ${expiredPauses.length} paused subscriptions`);
    return expiredPauses.length;
};

// ─── Get User's Subscriptions ──────────────────────────────────────────────
export const getUserSubscriptions = async (userId, status) => {
    const filter = { userId };
    if (status) filter.status = status;
    return DMBSubscription.find(filter)
        .populate('vendorId', 'restaurantName profileImage rating city')
        .populate('mealPlanId', 'name photos pricePerDay nutrition allergens')
        .populate('meals.mealPlanId', 'name photos pricePerDay nutrition allergens')
        .sort({ createdAt: -1 });
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const getNextMonday = () => {
    const today = new Date();
    const day = today.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
};

const getMonthKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// ─── Seed Duration Plans ────────────────────────────────────────────────────
export const seedDurationPlans = async () => {
    try {
        const { DMBDurationPlan } = await import('./durationPlan.model.js');
        const count = await DMBDurationPlan.countDocuments({});
        if (count === 0) {
            const defaults = [
                {
                    label: 'One Day',
                    code: 'one_day',
                    daysCountMonFri: 1,
                    daysCountFullWeek: 1,
                    description: 'Try out for a single day delivery'
                },
                {
                    label: 'Weekly',
                    code: 'weekly',
                    daysCountMonFri: 5,
                    daysCountFullWeek: 7,
                    description: 'Get meals delivered for 1 week'
                },
                {
                    label: 'Monthly',
                    code: 'monthly',
                    daysCountMonFri: 20,
                    daysCountFullWeek: 30,
                    description: 'Get meals delivered for 4 weeks'
                }
            ];
            await DMBDurationPlan.insertMany(defaults);
            logger.info('DMB default duration plans seeded successfully.');
        }
    } catch (err) {
        logger.error(`Failed to seed DMB duration plans: ${err.message}`);
    }
};
