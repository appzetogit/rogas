import mongoose from 'mongoose';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { getControl, isEnabled, raiseAdminAlert } from '../platform/platformConfig.service.js';
import { notify } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';
import { logger } from '../../../utils/logger.js';

/**
 * Gap R — three separate ratings after delivery:
 *   meal quality        → the vendor's rating (delivery problems can never lower it)
 *   delivery experience → the driver's rating (bad food can never lower it); alert when < 3.5 over 20+ deliveries
 *   overall             → platform analytics
 * One shared comment (max 200 chars), shown to the vendor, never to the driver.
 * With ACM-159 off the customer gives one overall rating, which then counts for vendor and driver alike.
 *
 * Gap T — vendors reply publicly (max 280 chars, editable 24h, never deletable by them); admins can hide a reply.
 */

export class RatingError extends Error {
    constructor(message, statusCode = 400, code = 'RATING_INVALID') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

const star = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 1 || n > 5) throw new RatingError('Ratings must be between 1 and 5 stars');
    return n;
};

const RATING_WINDOW_MS = 24 * 3600_000;
const VENDOR_ALERT_THRESHOLD = 3.8;
const VENDOR_ALERT_MIN_COUNT = 50;
const DRIVER_ALERT_THRESHOLD = 3.5;
const DRIVER_ALERT_MIN_COUNT = 20;

const avgOf = async (match, field) => {
    const [row] = await DMBDailyOrder.aggregate([
        { $match: { ...match, [field]: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: `$${field}` }, count: { $sum: 1 } } }
    ]);
    return { average: row ? Math.round(row.avg * 100) / 100 : 0, count: row?.count || 0 };
};

/** Recomputes the vendor's meal rating (and each meal plan's) from all rated orders. */
export const refreshVendorRating = async (vendorId) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const meal = await avgOf({ vendorId: new mongoose.Types.ObjectId(String(vendorId)) }, 'ratings.mealQuality');
    const [total, responded] = await Promise.all([
        DMBDailyOrder.countDocuments({ vendorId, ratedAt: { $ne: null }, $or: [{ ratingFeedback: { $ne: '' } }, { 'ratings.mealQuality': { $ne: null } }] }),
        DMBDailyOrder.countDocuments({ vendorId, ratedAt: { $ne: null }, 'vendorResponse.createdAt': { $ne: null } })
    ]);
    await FoodRestaurant.updateOne({ _id: vendorId }, {
        $set: { mealRating: meal, rating: meal.average, totalRatings: meal.count, reviewStats: { total, responded } }
    });
    // Amendment 1 #18: vendor average below 3.8 over 50+ rated orders -> alert for the City Manager.
    if (meal.count >= VENDOR_ALERT_MIN_COUNT && meal.average < VENDOR_ALERT_THRESHOLD) {
        try {
            const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName').lean();
            const month = new Date().toISOString().slice(0, 7);
            await raiseAdminAlert({
                type: 'vendor_low_rating', severity: 'warning',
                title: `Low meal rating: ${vendor?.restaurantName || 'vendor'} (${meal.average}★)`,
                message: `${vendor?.restaurantName || 'A vendor'} averages ${meal.average}★ over ${meal.count} rated orders (threshold ${VENDOR_ALERT_THRESHOLD}).`,
                entityType: 'FoodRestaurant', entityId: vendorId, link: '/admin/food/restaurants', dedupeKey: `vendor_low_rating:${vendorId}:${month}`
            });
        } catch (alertErr) {
            logger.warn(`[ratings] vendor low-rating alert failed: ${alertErr.message}`);
        }
    }
    return meal;
};

const refreshMealPlanRatings = async (mealPlanIds) => {
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    for (const id of mealPlanIds) {
        const [row] = await DMBDailyOrder.aggregate([
            { $match: { 'meals.mealPlanId': new mongoose.Types.ObjectId(String(id)), 'ratings.mealQuality': { $ne: null } } },
            { $group: { _id: null, avg: { $avg: '$ratings.mealQuality' }, count: { $sum: 1 } } }
        ]);
        if (row) await DMBMealPlan.updateOne({ _id: id }, { $set: { rating: Math.round(row.avg * 100) / 100, totalRatings: row.count } });
    }
};

/** Recomputes the driver's delivery rating; raises an AP-01 alert when it drops below 3.5 over 20+ deliveries. */
export const refreshDriverRating = async (driverId) => {
    const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
    const res = await avgOf({ 'dispatch.deliveryPartnerId': new mongoose.Types.ObjectId(String(driverId)) }, 'ratings.deliveryExperience');
    await FoodDeliveryPartner.updateOne({ _id: driverId }, { $set: { rating: res.average, totalRatings: res.count, deliveryRating: res } });
    if (res.count >= DRIVER_ALERT_MIN_COUNT && res.average < DRIVER_ALERT_THRESHOLD) {
        const driver = await FoodDeliveryPartner.findById(driverId).select('name').lean();
        const month = new Date().toISOString().slice(0, 7);
        await raiseAdminAlert({
            type: 'driver_low_rating', severity: 'warning',
            title: `Low delivery rating: ${driver?.name || 'driver'} (${res.average}★)`,
            message: `${driver?.name || 'A driver'} averages ${res.average}★ for delivery experience over ${res.count} rated deliveries (threshold ${DRIVER_ALERT_THRESHOLD}).`,
            entityType: 'FoodDeliveryPartner', entityId: driverId, link: `/admin/food/delivery-partners`, dedupeKey: `driver_low_rating:${driverId}:${month}`
        });
    }
    return res;
};

export const rateOrder = async ({ userId, orderId, body = {} }) => {
    const order = await DMBDailyOrder.findOne({ _id: orderId, userId });
    if (!order) throw new RatingError('Order not found', 404, 'NOT_FOUND');
    if (order.status !== 'delivered') throw new RatingError('Can only rate delivered orders');
    // The rating prompt exists for 24 hours after the confirmed delivery.
    if (order.deliveredAt && Date.now() - new Date(order.deliveredAt).getTime() > RATING_WINDOW_MS) {
        throw new RatingError('The rating window (24 hours after delivery) has closed', 403, 'RATING_WINDOW_CLOSED');
    }
    if (order.isRated) throw new RatingError('Order has already been rated', 409, 'ALREADY_RATED');

    const split = await isEnabled('splitRatings');
    let mealQuality = null, deliveryExperience = null, overall = null;
    if (split) {
        mealQuality = star(body.mealQuality);
        deliveryExperience = star(body.deliveryExperience);
        overall = star(body.overall ?? body.rating);
        if (mealQuality === null && deliveryExperience === null && overall === null) throw new RatingError('Give at least one rating');
    } else {
        overall = star(body.overall ?? body.rating);
        if (overall === null) throw new RatingError('Rating must be between 1 and 5');
        // Single rating mode: it counts for the maker and the driver alike.
        mealQuality = overall;
        deliveryExperience = overall;
    }
    const comment = String(body.comment ?? body.feedback ?? '').trim();
    if (comment.length > 200) throw new RatingError('Comment can be at most 200 characters');

    order.ratings = { mealQuality, deliveryExperience, overall };
    order.deliveryRating = deliveryExperience ?? overall;
    order.ratingFeedback = comment;
    order.driverTip = Math.max(0, Number(body.tipAmount) || 0);
    order.isRated = true;
    order.ratedAt = new Date();
    await order.save();

    try {
        if (mealQuality !== null) {
            await refreshVendorRating(order.vendorId);
            await refreshMealPlanRatings(order.meals.map((m) => m.mealPlanId).filter(Boolean));
        }
        if (deliveryExperience !== null && order.dispatch?.deliveryPartnerId) await refreshDriverRating(order.dispatch.deliveryPartnerId);
    } catch (err) {
        logger.warn(`[ratings] aggregate refresh failed for ${order.orderId}: ${err.message}`);
    }
    return order.toObject();
};

// ─── Gap T: vendor responses ─────────────────────────────────────────────────────────────────────────────

const alias = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Customer';
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};

const reviewFilter = (vendorId) => ({ vendorId, ratedAt: { $ne: null } });

/** VM-09: the vendor's reviews. The delivery-experience rating is never shown to vendors. */
export const listVendorReviews = async (vendorId, { page = 1, limit = 20, filter = 'all' } = {}) => {
    const q = reviewFilter(vendorId);
    if (filter === 'unanswered') q['vendorResponse.createdAt'] = null;
    if (filter === 'answered') q['vendorResponse.createdAt'] = { $ne: null };
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * lim;
    const [rows, total, stats] = await Promise.all([
        DMBDailyOrder.find(q).sort({ ratedAt: -1 }).skip(skip).limit(lim).populate('userId', 'name').lean(),
        DMBDailyOrder.countDocuments(q),
        DMBDailyOrder.aggregate([
            { $match: { vendorId: new mongoose.Types.ObjectId(String(vendorId)), ratedAt: { $ne: null } } },
            { $group: { _id: null, total: { $sum: 1 }, responded: { $sum: { $cond: [{ $ifNull: ['$vendorResponse.createdAt', false] }, 1, 0] } }, avgMeal: { $avg: '$ratings.mealQuality' }, avgOverall: { $avg: '$ratings.overall' } } }
        ])
    ]);
    const enabled = await isEnabled('vendorReviewResponses');
    return {
        responsesEnabled: enabled,
        stats: {
            total: stats[0]?.total || 0,
            responded: stats[0]?.responded || 0,
            responseRate: stats[0]?.total ? Math.round((stats[0].responded / stats[0].total) * 1000) / 10 : 0,
            avgMealQuality: stats[0]?.avgMeal ? Math.round(stats[0].avgMeal * 10) / 10 : null,
            avgOverall: stats[0]?.avgOverall ? Math.round(stats[0].avgOverall * 10) / 10 : null
        },
        total,
        reviews: rows.map((o) => ({
            orderId: o._id,
            orderRef: o.orderId,
            customerAlias: alias(o.userId?.name),
            mealQuality: o.ratings?.mealQuality ?? null,
            overall: o.ratings?.overall ?? null,
            comment: o.ratingFeedback || '',
            meals: (o.meals || []).map((m) => m.name),
            deliveryDate: o.deliveryDate,
            ratedAt: o.ratedAt,
            response: o.vendorResponse?.createdAt ? {
                text: o.vendorResponse.text,
                createdAt: o.vendorResponse.createdAt,
                editedAt: o.vendorResponse.editedAt,
                hidden: Boolean(o.vendorResponse.hidden),
                hiddenReason: o.vendorResponse.hidden ? o.vendorResponse.hiddenReason : '',
                editableUntil: new Date(new Date(o.vendorResponse.createdAt).getTime() + 24 * 3600_000)
            } : null
        }))
    };
};

export const respondToReview = async ({ vendorId, orderId, text }) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName zoneId').lean();
    if (!(await isEnabled('vendorReviewResponses', { zoneId: vendor?.zoneId }))) {
        throw new RatingError('Responding to reviews is switched off', 403, 'FEATURE_DISABLED');
    }
    const clean = String(text || '').trim();
    if (!clean) throw new RatingError('Write a response first');
    if (clean.length > 280) throw new RatingError('A response can be at most 280 characters');
    const order = await DMBDailyOrder.findOne({ _id: orderId, ...reviewFilter(vendorId) });
    if (!order) throw new RatingError('Review not found', 404, 'NOT_FOUND');
    const now = new Date();
    const isNew = !order.vendorResponse?.createdAt;
    if (!isNew) {
        if (order.vendorResponse.hidden) throw new RatingError('This response was hidden by an administrator and cannot be edited', 403, 'RESPONSE_HIDDEN');
        if (now - new Date(order.vendorResponse.createdAt) > 24 * 3600_000) throw new RatingError('A response can only be edited within 24 hours', 403, 'EDIT_WINDOW_CLOSED');
    }
    order.vendorResponse = {
        ...(order.vendorResponse?.toObject?.() || {}),
        text: clean,
        createdAt: order.vendorResponse?.createdAt || now,
        editedAt: isNew ? null : now,
        hidden: false
    };
    await order.save();
    await refreshVendorRating(vendorId).catch(() => {});
    if (isNew) {
        await notify({
            to: 'customer', id: order.userId, event: 'review_response',
            title: msg('{{vendor}} responded to your review', { vendor: vendor?.restaurantName || 'Your maker' }),
            body: clean.slice(0, 120),
            link: '/user/orders',
            data: { orderId: String(order._id) }
        });
    }
    return order.vendorResponse;
};

/** AP-05 moderation: hide / unhide / delete a vendor reply (reason required, audited by the caller). */
export const moderateResponse = async ({ orderId, action, reason, adminId }) => {
    const order = await DMBDailyOrder.findById(orderId);
    if (!order?.vendorResponse?.createdAt) throw new RatingError('This review has no vendor response', 404, 'NOT_FOUND');
    if (!['hide', 'unhide', 'delete'].includes(action)) throw new RatingError('Unknown action');
    if (action !== 'unhide' && !String(reason || '').trim()) throw new RatingError('A reason is required');
    const before = order.vendorResponse.toObject();
    if (action === 'delete') {
        order.vendorResponse = { text: '', createdAt: null, editedAt: null, hidden: false, hiddenReason: String(reason).trim(), hiddenBy: adminId, hiddenAt: new Date() };
    } else {
        order.vendorResponse.hidden = action === 'hide';
        order.vendorResponse.hiddenReason = action === 'hide' ? String(reason).trim() : '';
        order.vendorResponse.hiddenBy = adminId;
        order.vendorResponse.hiddenAt = new Date();
    }
    await order.save();
    await refreshVendorRating(order.vendorId).catch(() => {});
    return { before, after: order.vendorResponse.toObject() };
};

/** Admin view of a vendor's reviews incl. all three ratings. */
export const adminVendorReviews = async (vendorId, { page = 1, limit = 50 } = {}) => {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * lim;
    const q = reviewFilter(vendorId);
    const [rows, total] = await Promise.all([
        DMBDailyOrder.find(q).sort({ ratedAt: -1 }).skip(skip).limit(lim).populate('userId', 'name').populate('dispatch.deliveryPartnerId', 'name').lean(),
        DMBDailyOrder.countDocuments(q)
    ]);
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName mealRating reviewStats').lean();
    return {
        vendor,
        responseRate: vendor?.reviewStats?.total ? Math.round((vendor.reviewStats.responded / vendor.reviewStats.total) * 1000) / 10 : 0,
        total,
        reviews: rows.map((o) => ({
            orderId: o._id, orderRef: o.orderId, customer: o.userId?.name || '', driver: o.dispatch?.deliveryPartnerId?.name || '',
            ratings: o.ratings, comment: o.ratingFeedback, ratedAt: o.ratedAt, response: o.vendorResponse
        }))
    };
};

export const ratingConfig = async (ctx) => ({ split: await isEnabled('splitRatings', ctx), commentMax: 200, responseMax: 280, responsesEnabled: (await getControl('vendorReviewResponses', ctx)).enabled });
