import mongoose from 'mongoose';
import { DMBOneTimeOrder } from './orders.models.js';
import { canSell } from './stock.service.js';
import { getControl, isEnabled, cityIdForZone } from '../platform/platformConfig.service.js';
import { deliveryFeeForZone } from '../platform/zoneFee.js';
import { holidaySetForCity } from '../platform/holiday.service.js';
import { offeredSlots, listSlots } from '../deliverySlot/deliverySlot.service.js';
import { servedZoneIds, vendorServesZone } from '../subscription/pricing.service.js';
import { assertAddressInZone, coordsOf, vendorHasValidLocation } from '../zones/zoneGeo.service.js';
import { notify } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';
import { addDays, dateOnlyFromStr, localToday, storageDateStr, zonedInstant, localDateStr } from '../../../utils/platformTime.js';
import { logger } from '../../../utils/logger.js';

/**
 * Select mode (Gap AG) and pre-orders for new meal launches (Gap M).
 * Both become an ordinary DMBDailyOrder (orderType one_time_select / pre_order) once paid, so the vendor, driver,
 * PIN and tracking flows are the same as for subscription deliveries.
 */

export class OneTimeError extends Error {
    constructor(message, statusCode = 400, code = 'INVALID') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const oid = (v) => (v && mongoose.Types.ObjectId.isValid(String(v)) ? String(v) : null);

/** Latest time a one-off order can be placed for a slot: the slot's cut-off, or at least 1 hour before it starts. */
const orderDeadline = (dateStr, slot) => zonedInstant(dateStr, slot.startTime).getTime() - Math.max(1, Number(slot.orderCutoffHours) || 0) * 3600_000;

const vatRates = async () => {
    // One-off meals use the VAT rates of the platform's weekly plan (the admin's VAT policy).
    const { VendorSubscriptionPlan } = await import('../subscription/vendorSubscriptionPlan.model.js');
    const plan = await VendorSubscriptionPlan.findOne({ status: 'active', duration: 'week' }).sort({ createdAt: 1 }).lean()
        || await VendorSubscriptionPlan.findOne({ status: 'active' }).sort({ createdAt: 1 }).lean();
    return { foodVat: Number(plan?.foodVat) || 0, deliveryVat: Number(plan?.deliveryVat) || 0 };
};

const priceOneTime = async ({ meal, quantity, zoneId }) => {
    const [{ fee }, sel, vat] = await Promise.all([deliveryFeeForZone(zoneId), getControl('selectMode', { zoneId }), vatRates()]);
    const foodCost = r2(meal.pricePerDay * quantity);
    const deliveryFee = r2(fee * (Number(sel.oneTimeFeeMultiplier) || 1));
    const foodVatAmount = r2(foodCost * vat.foodVat / 100);
    const deliveryVatAmount = r2(deliveryFee * vat.deliveryVat / 100);
    const { resolvePaymentContext } = await import('../../payments/payments.settings.js');
    const { currency } = await resolvePaymentContext({ zoneId });
    return {
        foodCost, foodVat: vat.foodVat, foodVatAmount, deliveryFee, deliveryVat: vat.deliveryVat, deliveryVatAmount, platformFee: 0,
        totalPrice: r2(foodCost + foodVatAmount + deliveryFee + deliveryVatAmount), currency
    };
};

// ─── Select mode (Gap AG) ──────────────────────────────────────────────────────────────────────────────

/** GET /select/meals — meals orderable today/tomorrow for a slot in the customer's zone, with live portions. */
export const browseSelectMeals = async ({ zoneId, date, slot, filters = {} }) => {
    if (!oid(zoneId)) throw new OneTimeError('Choose your delivery zone first', 400, 'ZONE_REQUIRED');
    if (!(await isEnabled('selectMode', { zoneId }))) throw new OneTimeError('Single-meal ordering is not available in your area', 403, 'FEATURE_DISABLED');
    const today = localToday();
    const day = date ? dateOnlyFromStr(date) : today;
    if (!day || day < today || day > addDays(today, 1)) throw new OneTimeError('Select meals can be ordered for today or tomorrow');
    const cityId = await cityIdForZone(zoneId);
    const holidays = await holidaySetForCity(cityId);
    if (holidays.has(storageDateStr(day))) return { date: storageDateStr(day), holiday: true, meals: [] };
    const weekend = await getControl('weekendDelivery', { cityId });
    const slots = await offeredSlots({ cityId, weekend });
    const dow = day.getUTCDay();
    const slotDef = slots.find((s) => s.key === slot) || slots.find((s) => s.availableDays.includes(dow));
    if (!slotDef || !slotDef.availableDays.includes(dow)) return { date: storageDateStr(day), slots, meals: [] };
    const closed = Date.now() >= orderDeadline(storageDateStr(day), slotDef);

    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const vendors = (await FoodRestaurant.find({ status: 'approved', vacationMode: { $ne: true }, isAcceptingOrders: { $ne: false } })
        .select('restaurantName profileImage coverImages rating mealRating zoneId deliveryZoneIds deliveryWeekdays ecoPackaging vendorType').lean())
        .filter((v) => servedZoneIds(v).includes(String(zoneId)))
        .filter((v) => !Array.isArray(v.deliveryWeekdays) || !v.deliveryWeekdays.length || v.deliveryWeekdays.includes(dow));
    const byId = new Map(vendors.map((v) => [String(v._id), v]));
    const mealFilter = { vendorId: { $in: vendors.map((v) => v._id) }, status: 'active' };
    if (filters.temperature) mealFilter.temperatureType = filters.temperature;
    const meals = await DMBMealPlan.find(mealFilter).select('name description photos pricePerDay vendorId nutrition allergens dietTags availableSlots temperatureType reheatInstructions planCategory capacity rating').lean();
    const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
    const out = [];
    for (const meal of meals) {
        if (meal.availableSlots?.length && !meal.availableSlots.includes(slotDef.key)) continue;
        const stock = await canSell(meal, day, 1);
        const menu = await DMBDailyMenu.findOne({ vendorId: meal.vendorId, mealPlanId: meal._id, date: day, slot: slotDef.key }).select('dishName photo').lean();
        const v = byId.get(String(meal.vendorId));
        out.push({
            mealPlanId: meal._id, name: menu?.dishName || meal.name, planName: meal.name, description: meal.description,
            photo: menu?.photo || meal.photos?.[0] || '', price: meal.pricePerDay, nutrition: meal.nutrition, allergens: meal.allergens,
            dietTags: meal.dietTags, temperatureType: meal.temperatureType || null, reheatInstructions: meal.reheatInstructions || '',
            vendorId: meal.vendorId, vendorName: v?.restaurantName || '', vendorRating: v?.mealRating?.average || v?.rating || null,
            remaining: stock.remaining, soldOut: stock.soldOut || closed
        });
    }
    out.sort((a, b) => Number(a.soldOut) - Number(b.soldOut) || a.price - b.price);
    const sel = await getControl('selectMode', { zoneId });
    const { fee } = await deliveryFeeForZone(zoneId);
    return {
        date: storageDateStr(day), slot: slotDef.key, slots: slots.filter((s) => s.availableDays.includes(dow)).map((s) => ({ key: s.key, name: s.name, icon: s.icon, startTime: s.startTime, endTime: s.endTime })),
        orderingClosed: closed, deliveryFee: r2(fee * (Number(sel.oneTimeFeeMultiplier) || 1)), meals: out
    };
};

const resolveAddress = async (userId, addressId, source) => {
    const { FoodUser } = await import('../../../core/users/user.model.js');
    const user = await FoodUser.findById(userId).select('addresses badDebt').lean();
    const a = (user?.addresses || []).find((x) => String(x._id) === String(addressId));
    if (!a) throw new OneTimeError('Choose a saved delivery address');
    const zone = await assertAddressInZone(a, { source, userId });
    return {
        address: { label: a.label, customLabel: a.customLabel || '', street: a.street, additionalDetails: a.additionalDetails || '', city: a.city, state: a.state, zipCode: a.zipCode || '', phone: a.phone || '', location: a.location, addressId: a._id, zoneId: zone.zoneId },
        zoneId: zone.zoneId,
        user
    };
};

/** Creates a Select order and returns it with its price; the caller starts the payment. */
export const createSelectOrder = async ({ userId, mealPlanId, quantity = 1, date, slot, addressId }) => {
    const { address, zoneId, user } = await resolveAddress(userId, addressId, 'select');
    if (user?.badDebt?.subscriptionBlocked) throw new OneTimeError('Ordering is blocked on this account. Please contact customer support.', 403, 'ACCOUNT_BLOCKED');
    if (!(await isEnabled('selectMode', { zoneId }))) throw new OneTimeError('Single-meal ordering is not available in your area', 403, 'FEATURE_DISABLED');
    const qty = Math.max(1, Math.min(10, Math.floor(Number(quantity) || 1)));
    const day = dateOnlyFromStr(date || localDateStr());
    const today = localToday();
    if (!day || day < today || day > addDays(today, 1)) throw new OneTimeError('Select meals can be ordered for today or tomorrow');
    const cityId = await cityIdForZone(zoneId);
    if ((await holidaySetForCity(cityId)).has(storageDateStr(day))) throw new OneTimeError('The platform is closed on that day');
    const slotDef = (await offeredSlots({ cityId, weekend: await getControl('weekendDelivery', { cityId }) })).find((s) => s.key === slot);
    if (!slotDef || !slotDef.availableDays.includes(day.getUTCDay())) throw new OneTimeError('That delivery slot is not available on this day');
    if (Date.now() >= orderDeadline(storageDateStr(day), slotDef)) throw new OneTimeError(`Ordering for ${slotDef.name} is closed — try a later slot or tomorrow`, 400, 'CUTOFF_PASSED');

    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const meal = await DMBMealPlan.findById(mealPlanId).lean();
    if (!meal || meal.status !== 'active') throw new OneTimeError('This meal is not available');
    const vendor = await FoodRestaurant.findById(meal.vendorId).select('status zoneId location deliveryZoneIds restaurantName vacationMode').lean();
    if (!vendor || vendor.status !== 'approved' || vendor.vacationMode) throw new OneTimeError('This maker is not taking orders');
    if (!vendorServesZone(vendor, zoneId)) throw new OneTimeError(`${vendor.restaurantName} does not deliver to your address`, 409, 'ZONE_MISMATCH');
    if (!(await vendorHasValidLocation(vendor))) throw new OneTimeError(`${vendor.restaurantName} is not available right now`, 409, 'VENDOR_LOCATION_INVALID');
    const stock = await canSell(meal, day, qty);
    if (!stock.ok) throw new OneTimeError(stock.soldOut ? 'Sold out' : `Only ${stock.remaining} portion(s) left`, 409, 'SOLD_OUT');

    const pricing = await priceOneTime({ meal, quantity: qty, zoneId });
    const order = await DMBOneTimeOrder.create({
        type: 'select', userId, vendorId: meal.vendorId, mealPlanId: meal._id, quantity: qty, deliveryDate: day, deliverySlot: slotDef.key,
        zoneId, deliveryAddress: address, pricing, status: 'pending_payment'
    });
    return order.toObject();
};

/** Turns a paid one-time order into its DMBDailyOrder. Idempotent. */
export const fulfilOneTimeOrder = async (oneTimeId, { paidWith = 'online', transactionId = '' } = {}) => {
    const order = await DMBOneTimeOrder.findById(oneTimeId);
    if (!order) throw new Error(`One-time order ${oneTimeId} not found`);
    if (order.dailyOrderId) return order.toObject();
    if (order.status === 'cancelled') return { attention: `${order.ref} was cancelled before its payment arrived; refund it` };
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const meal = await DMBMealPlan.findById(order.mealPlanId).select('name temperatureType').lean();
    const daily = await DMBDailyOrder.create({
        orderType: order.type === 'pre_order' ? 'pre_order' : 'one_time_select',
        userId: order.userId, vendorId: order.vendorId, zoneId: order.zoneId,
        meals: [{ mealPlanId: order.mealPlanId, name: meal?.name || '', quantity: order.quantity, temperatureType: meal?.temperatureType || null }],
        hasColdMeal: meal?.temperatureType === 'cold',
        deliveryDate: order.deliveryDate, deliverySlot: order.deliverySlot, status: 'scheduled',
        pricing: order.pricing, deliveryAddress: order.deliveryAddress,
        paymentStatus: 'paid', paymentTransactionId: transactionId || order.paymentTransactionId || ''
    });
    order.status = 'paid';
    order.paidWith = paidWith;
    order.dailyOrderId = daily._id;
    if (transactionId) order.paymentTransactionId = transactionId;
    await order.save();
    await notify({
        to: 'vendor', id: order.vendorId, event: order.type === 'pre_order' ? 'preorder_confirmed' : 'select_order',
        title: order.type === 'pre_order' ? msg('Pre-order confirmed') : msg('New single-meal order'),
        body: msg('{{qty}} × {{meal}} for {{date}} ({{slot}})', { qty: order.quantity, meal: meal?.name || '', date: storageDateStr(order.deliveryDate), slot: order.deliverySlot }),
        data: { orderId: String(daily._id) }
    });
    return order.toObject();
};

/** Select mode → subscription conversion prompt after delivery (Gap AG). Called when a one-off order is delivered. */
export const sendConversionPrompt = async (dailyOrder) => {
    try {
        if (dailyOrder.orderType !== 'one_time_select' || dailyOrder.conversionPromptSentAt) return;
        const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
        const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
        const vendor = await FoodRestaurant.findById(dailyOrder.vendorId).select('restaurantName').lean();
        await DMBDailyOrder.updateOne({ _id: dailyOrder._id }, { $set: { conversionPromptSentAt: new Date() } });
        await notify({
            to: 'customer', id: dailyOrder.userId, event: 'subscribe_offer',
            title: msg('Enjoyed your meal?'),
            body: msg('Subscribe to {{vendor}} and get this every week — skip or swap anytime.', { vendor: vendor?.restaurantName || '' }),
            link: `/user/plans?vendor=${dailyOrder.vendorId}`, data: { vendorId: String(dailyOrder.vendorId), source: 'select_conversion' }
        });
    } catch (err) {
        logger.warn(`[select] conversion prompt failed: ${err.message}`);
    }
};

/** Marks recent Select orders as converted when the customer subscribes to that maker (AP-11 conversion metric). */
export const recordConversion = async (subscription) => {
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const since = new Date(Date.now() - 30 * 86_400_000);
    const vendorIds = [subscription.vendorId, ...((subscription.rotation || []).map((r) => r.vendorId))];
    await DMBDailyOrder.updateMany(
        { userId: subscription.userId, orderType: 'one_time_select', vendorId: { $in: vendorIds }, deliveryDate: { $gte: since }, convertedToSubscriptionId: null },
        { $set: { convertedToSubscriptionId: subscription._id } }
    );
};

// ─── Pre-orders (Gap M) ─────────────────────────────────────────────────────────────────────────────────

export const reservePreOrder = async ({ userId, mealPlanId, quantity = 1, slot, addressId }) => {
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const meal = await DMBMealPlan.findById(mealPlanId).lean();
    if (!meal || meal.status !== 'pre_order' || !meal.launchDate) throw new OneTimeError('This meal is not open for pre-orders');
    const cutoff = meal.preorderCutoff || addDays(meal.launchDate, -1);
    if (localToday() > new Date(cutoff)) throw new OneTimeError('Pre-orders for this meal have closed', 400, 'PREORDER_CLOSED');
    const { address, zoneId } = await resolveAddress(userId, addressId, 'checkout');
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const vendor = await FoodRestaurant.findById(meal.vendorId).select('restaurantName zoneId location deliveryZoneIds').lean();
    if (!vendorServesZone(vendor, zoneId)) throw new OneTimeError(`${vendor?.restaurantName || 'This maker'} does not deliver to your address`, 409, 'ZONE_MISMATCH');
    if (!(await vendorHasValidLocation(vendor))) throw new OneTimeError(`${vendor?.restaurantName || 'This maker'} is not available right now`, 409, 'VENDOR_LOCATION_INVALID');
    const slots = await listSlots();
    const slotDef = slots.find((s) => s.key === slot && s.status === 'active') || slots.find((s) => s.status === 'active' && (!meal.availableSlots?.length || meal.availableSlots.includes(s.key)));
    if (!slotDef) throw new OneTimeError('Choose a delivery slot');
    const qty = Math.max(1, Math.min(10, Math.floor(Number(quantity) || 1)));
    const existing = await DMBOneTimeOrder.findOne({ userId, mealPlanId, type: 'pre_order', status: { $in: ['reserved', 'payment_pending'] } });
    if (existing) throw new OneTimeError('You already reserved this meal', 409, 'ALREADY_RESERVED');
    const pricing = await priceOneTime({ meal, quantity: qty, zoneId });
    const order = await DMBOneTimeOrder.create({
        type: 'pre_order', userId, vendorId: meal.vendorId, mealPlanId: meal._id, quantity: qty,
        deliveryDate: new Date(storageDateStr(meal.launchDate)), deliverySlot: slotDef.key, zoneId, deliveryAddress: address, pricing, status: 'reserved'
    });
    return order.toObject();
};

export const cancelPreOrder = async ({ userId, id }) => {
    const order = await DMBOneTimeOrder.findOne({ _id: id, userId, type: 'pre_order' });
    if (!order) throw new OneTimeError('Reservation not found', 404);
    if (!['reserved', 'payment_pending'].includes(order.status)) throw new OneTimeError('This reservation can no longer be cancelled');
    order.status = 'cancelled';
    order.cancelReason = 'Cancelled by customer';
    await order.save();
    return order.toObject();
};

export const myOneTimeOrders = async (userId, type) => {
    const filter = { userId };
    if (type) filter.type = type;
    return DMBOneTimeOrder.find(filter).sort({ createdAt: -1 }).limit(100)
        .populate('mealPlanId', 'name photos launchDate status').populate('vendorId', 'restaurantName').lean();
};

/** Vendor forecast: reservations per pre-order meal (VM-NEW-01). */
export const preOrderDemand = async (vendorId) => {
    const rows = await DMBOneTimeOrder.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(String(vendorId)), type: 'pre_order', status: { $in: ['reserved', 'payment_pending', 'paid'] } } },
        { $group: { _id: { meal: '$mealPlanId', date: '$deliveryDate', slot: '$deliverySlot' }, portions: { $sum: '$quantity' }, reservations: { $sum: 1 } } }
    ]);
    return rows.map((r) => ({ mealPlanId: r._id.meal, date: storageDateStr(r._id.date), slot: r._id.slot, portions: r.portions, reservations: r.reservations }));
};

/**
 * Job (00:01 local): meals launching today become active; their reservations are charged — from the wallet when it
 * covers the price, otherwise the customer gets a payment link (pay before the slot's cut-off or it is cancelled).
 */
export const processLaunches = async (now = new Date()) => {
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const today = localToday(now);
    const launching = await DMBMealPlan.find({ status: 'pre_order', launchDate: { $lte: addDays(today, 1) } });
    let launched = 0, charged = 0, awaiting = 0;
    for (const meal of launching) {
        if (new Date(storageDateStr(meal.launchDate)) > today) continue;
        meal.status = 'active';
        meal.launchedAt = now;
        await meal.save();
        launched++;
    }
    const due = await DMBOneTimeOrder.find({ type: 'pre_order', status: 'reserved', deliveryDate: { $lte: today } });
    const { deductWalletBalance } = await import('../../food/user/services/userWallet.service.js');
    for (const res of due) {
        try {
            await deductWalletBalance(res.userId, res.pricing.totalPrice, `Pre-order ${res.ref}`, { oneTimeOrderId: res._id });
            await fulfilOneTimeOrder(res._id, { paidWith: 'wallet' });
            charged++;
            await notify({ to: 'customer', id: res.userId, event: 'preorder_launch', title: msg('Your pre-order is confirmed'), body: msg('We charged your wallet for your pre-ordered meal. Enjoy!'), link: '/user/one-time-orders' });
        } catch {
            res.status = 'payment_pending';
            res.launchProcessedAt = now;
            await res.save();
            awaiting++;
            await notify({
                to: 'customer', id: res.userId, event: 'payment_failed',
                title: msg('Complete your pre-order payment'),
                body: msg('Your reserved meal launches today. Pay now in the app to confirm it.'),
                link: '/user/one-time-orders'
            });
        }
    }
    // Unpaid reservations whose delivery slot cut-off has passed are cancelled.
    const slots = await listSlots();
    const pending = await DMBOneTimeOrder.find({ type: 'pre_order', status: 'payment_pending' });
    let cancelled = 0;
    for (const res of pending) {
        const slot = slots.find((s) => s.key === res.deliverySlot);
        if (slot && Date.now() >= orderDeadline(storageDateStr(res.deliveryDate), slot)) {
            res.status = 'cancelled';
            res.cancelReason = 'Not paid before the delivery cut-off';
            await res.save();
            cancelled++;
        }
    }
    return { launched, charged, awaiting, cancelled };
};

/** Starts the payment of a Select order or a launch-day pre-order (purpose one_time_order). */
export const startOneTimePayment = async ({ userId, order, provider, returnPath, cancelPath, language }) => {
    const { startPayment } = await import('../../payments/payments.service.js');
    const { resolvePaymentContext, resolveProviders } = await import('../../payments/payments.settings.js');
    const { FoodUser } = await import('../../../core/users/user.model.js');
    const user = await FoodUser.findById(userId).select('name email phone countryCode').lean();
    const ctx = await resolvePaymentContext({ zoneId: order.zoneId, dialCode: user?.countryCode });
    const available = await resolveProviders({ country: ctx.country, currency: ctx.currency });
    if (!available.length) throw new OneTimeError('No payment method is available for your region right now', 503, 'NO_PROVIDER');
    const chosen = provider && available.includes(provider) ? provider : available[0];
    const { payment } = await startPayment({
        purpose: 'one_time_order', ownerType: 'user', ownerId: userId, amount: order.pricing.totalPrice, currency: ctx.currency, country: ctx.country,
        provider: chosen, description: `DailyMealBox ${order.type === 'pre_order' ? 'pre-order' : 'meal'} ${order.ref}`,
        customer: { name: user?.name, email: user?.email, phone: user?.phone }, language,
        returnPath: returnPath || '/user/orders', cancelPath: cancelPath || '/user/plans', refs: { oneTimeOrderId: String(order._id) }
    });
    await DMBOneTimeOrder.updateOne({ _id: order._id }, { $set: { paymentTransactionId: payment.transactionId } });
    return payment;
};

/** Payment purpose handlers (registered in modules/payments/purposes). */
export const oneTimePurpose = {
    async onPaid(tx) {
        const res = await fulfilOneTimeOrder(tx.refs?.oneTimeOrderId, { paidWith: 'online', transactionId: tx.publicId });
        return res?.attention ? { attention: res.attention } : undefined;
    },
    async onFailed(tx) {
        const order = await DMBOneTimeOrder.findById(tx.refs?.oneTimeOrderId);
        if (order?.type === 'select' && order.status === 'pending_payment') {
            order.status = 'failed';
            await order.save();
        }
    }
};
