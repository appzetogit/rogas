import mongoose from 'mongoose';
import { DMBSubscription } from './subscription.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { FoodOrder } from '../../food/orders/models/order.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { sendNotificationToUser } from '../../../core/notifications/notification.service.js';
import { logger } from '../../../utils/logger.js';
import { getIO } from '../../../config/socket.js';
import { assertValidSlotKeys } from '../deliverySlot/deliverySlot.service.js';
import { msg } from '../../i18n/i18n.service.js';
import { queueEmail } from '../../email/email.service.js';

/**
 * Never lets an email problem break a subscription action. Each `queueEmail({...})` below is written out at its
 * own call site with literal subjectKey/bodyKey text — the i18n catalog extractor needs that literal to make a
 * string translatable; forwarding it through a variable would hide it from every language but English.
 */
const emailSafe = (promise, label) => promise.catch((err) => logger.warn(`${label} not sent: ${err?.message || err}`));

const findSubQuery = (id, extra = {}) => {
    if (mongoose.Types.ObjectId.isValid(id)) {
        return { $or: [{ _id: id }, { subscriptionId: id }], ...extra };
    }
    return { subscriptionId: id, ...extra };
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const toDateOnly = (date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
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
    billingEmail,
    startDate: requestedStartDate
}) => {
    // Check if customer already has an active or paused subscription
    const existingActive = await DMBSubscription.findOne({
        userId,
        status: { $in: ['active', 'paused'] }
    });
    if (existingActive) {
        throw new Error('You already have an active or paused subscription plan.');
    }

    // ── Determine & validate startDate ──────────────────────────────────────
    const todayMidnight = toDateOnly(new Date());

    let startDate;
    if (requestedStartDate) {
        // Parse the provided date (YYYY-MM-DD string or ISO)
        const parsed = toDateOnly(new Date(requestedStartDate));
        if (isNaN(parsed.getTime())) {
            throw new Error('Invalid startDate provided.');
        }
        if (parsed <= todayMidnight) {
            throw new Error('Subscription start date must be a future date (not today or past).');
        }
        startDate = parsed;
    } else {
        // Default: tomorrow
        startDate = new Date(todayMidnight);
        startDate.setUTCDate(startDate.getUTCDate() + 1);
    }
    // ────────────────────────────────────────────────────────────────────────

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
    if (finalSlots.length === 0) throw new Error('At least one delivery slot is required');
    await assertValidSlotKeys(finalSlots);
    const finalSlot = finalSlots[0];

    // Fetch user to check role — for EMPLOYEE, always use company's central delivery address
    const user = await FoodUser.findById(userId).lean();
    if (user?.role === 'EMPLOYEE' && user?.deliveryAddress) {
        // Always override with the company-set central delivery address, regardless of what frontend sent
        finalAddress = {
            street: user.deliveryAddress,
            city: user.city || 'Local',
            state: 'Local',
            label: 'Office',
            ...(finalAddress?.location ? { location: finalAddress.location } : {})
        };
    }

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
        currency: pricing?.currency || 'PLN'
    };

    // Calculate endDate from the resolved startDate
    const endDate = new Date(startDate);
    if (duration === 'weekly') {
        endDate.setUTCDate(startDate.getUTCDate() + 7);
    } else if (duration === 'monthly') {
        endDate.setUTCDate(startDate.getUTCDate() + 30);
    } else if (duration === 'one_day') {
        endDate.setUTCDate(startDate.getUTCDate() + 1);
    } else {
        endDate.setUTCDate(startDate.getUTCDate() + 7);
    }

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

    logger.info(`Subscription created: ${subscription.subscriptionId} for user ${userId}, startDate: ${startDate.toISOString()}`);
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
    await FoodUser.findByIdAndUpdate(sub.userId, { subscriptionStatus: 'active' });

    // Gap AG: a recent Select-mode customer who now subscribes to that maker counts as a conversion.
    try {
        const { recordConversion } = await import('../orders/oneTimeOrder.service.js');
        await recordConversion(sub);
    } catch (err) {
        logger.warn(`Select conversion tracking failed for ${sub.subscriptionId}: ${err.message}`);
    }
    if (sub.renewsSubscriptionId) {
        await DMBSubscription.updateOne({ _id: sub.renewsSubscriptionId }, { $set: { renewedBySubscriptionId: sub._id, pendingRotation: undefined, pendingRotationFrom: null } });
    }
    // Gap S: a paid replacement shortens the subscription it replaces (and credits unused days when downgrading).
    if (sub.replacesSubscriptionId) {
        try {
            const { applyPendingChange } = await import('./subscriptionCheckout.service.js');
            await applyPendingChange(sub);
        } catch (err) {
            logger.error(`Plan change for ${sub.subscriptionId} could not be applied: ${err.message}`);
        }
    }

    // Create today's/tomorrow's orders now, so the vendor sees this subscription immediately (the hourly job would
    // otherwise leave it invisible for up to an hour). A failure here must not undo the activation.
    try {
        const { generateForSubscription } = await import('./orderGeneration.js');
        const gen = await generateForSubscription(sub.toObject());
        logger.info(`Subscription ${sub.subscriptionId} activated: ${gen.created} order(s) created for today/tomorrow`);
    } catch (err) {
        logger.warn(`Immediate order generation failed for ${sub.subscriptionId} (the hourly job will retry): ${err.message}`);
    }

    // Notify vendor: new subscriber
    await sendNotificationToUser({
        recipientId: sub.vendorId,
        recipientType: 'vendor',
        title: msg('New Subscriber! 🎉'),
        body: msg('A new customer subscribed to your meal plan.'),
        data: { screen: 'subscribers', event: 'new_subscriber', subscriptionId }
    });
    const vendor = await FoodRestaurant.findById(sub.vendorId).select('ownerEmail').lean();
    if (vendor?.ownerEmail) {
        await emailSafe(
            queueEmail({
                to: vendor.ownerEmail,
                subjectKey: 'New Subscriber! 🎉',
                bodyKey: 'A new customer subscribed to your meal plan. Open the vendor app to see the details.',
                ownerType: 'RESTAURANT',
                ownerId: sub.vendorId
            }),
            `New-subscriber email for vendor ${sub.vendorId}`
        );
    }

    return sub;
};

// ─── Skip Delivery (PRD ACM-13) ────────────────────────────────────────────
export const skipDelivery = async ({ subscriptionId, userId, skipDate, reason }) => {
    const sub = await DMBSubscription.findOne(findSubQuery(subscriptionId, { userId }));
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
        title: msg('Customer Skip'),
        body: msg("A customer skipped tomorrow's delivery. Update your preparation count."),
        data: { screen: 'orders', event: 'subscriber_skip', subscriptionId, skipDate }
    });

    logger.info(`Skip recorded: ${subscriptionId} on ${skipDate}, wallet credited ${creditAmount}`);
    return { skipsUsed: sub.skipsUsedThisMonth, maxSkips: sub.maxSkipsPerMonth, walletCredited: creditAmount };
};

// ─── Pause / Resume (PRD ACM-14) ───────────────────────────────────────────
// Pausing removes the not-yet-prepared deliveries inside the pause window and moves the end date out by the same number
// of delivery days (using the subscription's own schedule, so custom days / per-day slots / fortnights stay correct).
// Resuming early gives back the days that were not actually paused.

const scheduleCtx = async (sub) => {
    const [{ listSlots }, { holidaySetForZone }] = await Promise.all([
        import('../deliverySlot/deliverySlot.service.js'),
        import('../platform/holiday.service.js')
    ]);
    return { slotDefs: await listSlots(), holidays: await holidaySetForZone(sub.zoneId) };
};

/** Delivery dates of a subscription in [from, to). */
const deliveryDatesBetween = async (sub, from, to) => {
    const { deliveriesOn } = await import('./schedule.js');
    const ctx = await scheduleCtx(sub);
    const out = [];
    for (let d = new Date(from); d < to; d = new Date(d.getTime() + 86_400_000)) {
        if (deliveriesOn(sub, d, ctx).length) out.push(new Date(d));
    }
    return out;
};

export const pauseSubscription = async ({ subscriptionId, userId, pauseDays, reason }) => {
    const sub = await DMBSubscription.findOne(findSubQuery(subscriptionId, { userId }));
    if (!sub) throw new Error('Subscription not found');
    if (sub.status !== 'active') throw new Error('Only active subscriptions can be paused');

    const maxPauseDays = sub.maxPauseDays || 2;
    const days = Math.floor(Number(pauseDays) || 0);
    if (days < 1) throw new Error('Pause for at least 1 day');
    if (days > maxPauseDays) throw new Error(`Max pause duration is ${maxPauseDays} days`);

    const { localToday, addDays } = await import('../../../utils/platformTime.js');
    const today = localToday();
    const tomorrow = addDays(today, 1);
    const pauseUntil = addDays(tomorrow, days);

    if (sub.endDate) {
        const remaining = await deliveryDatesBetween(sub.toObject(), tomorrow, new Date(sub.endDate));
        if (remaining.length <= 1) throw new Error('Cannot pause: your subscription has only 1 delivery left.');
        if (pauseUntil >= new Date(sub.endDate)) {
            throw new Error('You cannot pause past the end of your subscription.');
        }
    }

    const lost = await deliveryDatesBetween(sub.toObject(), tomorrow, pauseUntil);
    sub.pauseOriginalEndDate = sub.endDate || null;
    if (sub.endDate && lost.length) {
        const { extendEndDateByDeliveries } = await import('./schedule.js');
        sub.endDate = extendEndDateByDeliveries(sub.toObject(), lost.length, await scheduleCtx(sub));
    }
    sub.status = 'paused';
    sub.pausedUntil = pauseUntil;
    sub.pausedAt = today;
    sub.requestedPauseDays = days;
    sub.pauseReason = reason || '';
    await sub.save();

    const { DMBDailyOrder } = await import('./dmb.dailyOrder.model.js');
    const removed = await DMBDailyOrder.find({ subscriptionId: sub._id, deliveryDate: { $gte: tomorrow, $lt: pauseUntil }, status: 'scheduled' }).select('_id orderId deliveryDate deliverySlot vendorId').lean();
    await DMBDailyOrder.deleteMany({ _id: { $in: removed.map((o) => o._id) } });

    const live = await DMBSubscription.exists({ userId: sub.userId, status: 'active' });
    if (!live) await FoodUser.findByIdAndUpdate(userId, { subscriptionStatus: 'paused' });

    try {
        const io = getIO();
        if (io) {
            io.to(`sub_${sub._id}`).emit('subscription_paused', { subscriptionId: sub.subscriptionId, status: sub.status, pausedUntil: sub.pausedUntil, endDate: sub.endDate });
            for (const vid of new Set(removed.map((o) => String(o.vendorId)))) {
                io.to(`vendor_${vid}`).emit('subscriber_paused', { subscriptionId: sub.subscriptionId, pausedUntil: sub.pausedUntil });
            }
            for (const o of removed) {
                io.to(`vendor_${o.vendorId}`).emit('order_status_update', { orderId: o.orderId, _id: o._id, status: 'removed', deliveryDate: o.deliveryDate, deliverySlot: o.deliverySlot, updatedAt: new Date().toISOString() });
            }
        }
    } catch (err) {
        logger.warn(`Failed to broadcast pause sockets: ${err.message}`);
    }

    logger.info(`Subscription paused: ${subscriptionId} until ${pauseUntil.toISOString()}, ${lost.length} delivery day(s) moved to the end`);
    return { pausedUntil: pauseUntil, endDate: sub.endDate, movedDeliveries: lost.length };
};

export const resumeSubscription = async (subscriptionId, { userId } = {}) => {
    const sub = await DMBSubscription.findOne(findSubQuery(subscriptionId, userId ? { status: 'paused', userId } : { status: 'paused' }));
    if (!sub) return null;

    const { localToday, addDays } = await import('../../../utils/platformTime.js');
    const today = localToday();
    // Early resume: give back the delivery days that were not actually paused.
    if (sub.pausedUntil && today < new Date(sub.pausedUntil) && sub.pauseOriginalEndDate) {
        const pausedFrom = addDays(new Date(sub.pausedAt || today), 1);
        const resumeFrom = addDays(today, 1);
        const actuallyLost = await deliveryDatesBetween({ ...sub.toObject(), endDate: null, status: 'active' }, pausedFrom, resumeFrom);
        const { extendEndDateByDeliveries } = await import('./schedule.js');
        sub.endDate = actuallyLost.length
            ? extendEndDateByDeliveries({ ...sub.toObject(), endDate: sub.pauseOriginalEndDate }, actuallyLost.length, await scheduleCtx(sub))
            : sub.pauseOriginalEndDate;
    }

    sub.status = 'active';
    sub.pausedUntil = null;
    sub.pausedAt = null;
    sub.requestedPauseDays = 0;
    sub.pauseReason = '';
    sub.pauseOriginalEndDate = null;
    await sub.save();

    await FoodUser.findByIdAndUpdate(sub.userId, { subscriptionStatus: 'active' });

    try {
        const { ensureOrdersForUser } = await import('./dmb.dailyOrder.service.js');
        await ensureOrdersForUser(sub.userId);
    } catch (err) {
        logger.warn(`Failed to immediately generate orders on resume: ${err.message}`);
    }

    try {
        const io = getIO();
        if (io) {
            io.to(`sub_${sub._id}`).emit('subscription_resumed', { subscriptionId: sub.subscriptionId, status: sub.status, endDate: sub.endDate });
            io.to(`vendor_${sub.vendorId}`).emit('subscriber_resumed', { subscriptionId: sub.subscriptionId });
        }
    } catch (err) {
        logger.warn(`Failed to broadcast resume sockets: ${err.message}`);
    }

    logger.info(`Subscription resumed: ${subscriptionId}`);
    return sub;
};

// ─── Cancel Subscription (PRD ACM-15 — EU Law, max 2-tap) ─────────────────
export const cancelSubscription = async ({ subscriptionId, userId, reason }) => {
    const sub = await DMBSubscription.findOneAndUpdate(
        findSubQuery(subscriptionId, { userId, status: { $in: ['active', 'paused'] } }),
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
        title: msg('Subscriber Cancelled'),
        body: msg('A subscriber cancelled. Check your analytics for retention tips.'),
        data: { screen: 'analytics', event: 'subscriber_cancelled', subscriptionId }
    });
    const [user, vendor] = await Promise.all([
        FoodUser.findById(userId).select('email').lean(),
        FoodRestaurant.findById(sub.vendorId).select('ownerEmail').lean()
    ]);
    if (user?.email) {
        await emailSafe(
            queueEmail({
                to: user.email,
                subjectKey: 'Your subscription has been cancelled',
                bodyKey: "We've cancelled your DailyMealBox subscription as requested. No more deliveries will be scheduled and you will not be charged again.\n\nYou can start a new subscription any time from the Plans tab.",
                ownerType: 'USER',
                ownerId: userId
            }),
            `Cancellation email for user ${userId}`
        );
    }
    if (vendor?.ownerEmail) {
        await emailSafe(
            queueEmail({
                to: vendor.ownerEmail,
                subjectKey: 'Subscriber Cancelled',
                bodyKey: 'A subscriber has cancelled their subscription to your meal plan. Check your analytics for retention tips.',
                ownerType: 'RESTAURANT',
                ownerId: sub.vendorId
            }),
            `Subscriber-cancelled email for vendor ${sub.vendorId}`
        );
    }

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
        .populate('vendorId', 'restaurantName profileImage rating city location phone ownerPhone')
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
