import mongoose from 'mongoose';
import { VendorSubscriptionPlan } from './vendorSubscriptionPlan.model.js';
import { DMBSubscription } from './subscription.model.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { buildPeriod, cycleFromPlanDuration, cleanDaySlots, cleanWeekdays, DAY_PRESETS, deliveriesOn, deliveryWeekdays } from './schedule.js';
import { getControl, cityIdForZone } from '../platform/platformConfig.service.js';
import { holidaySetForCity } from '../platform/holiday.service.js';
import { deliveryFeeForZone } from '../platform/zoneFee.js';
import { offeredSlots } from '../deliverySlot/deliverySlot.service.js';
import { addDays, dateOnlyFromStr, localToday, storageDateStr } from '../../../utils/platformTime.js';

/**
 * Authoritative subscription pricing (server-side quote).
 *
 * The browser shows this quote and the checkout charges exactly this amount — the client never computes the price.
 * Covers every plan shape in the amendment: weekly / fortnightly (alternate weeks) / monthly / annual (ACM-149),
 * custom delivery days (ACM-146), per-day slots (ACM-147), max slots per day (ACM-148), trial week (ACM-150),
 * Family Box (ACM-172), Smart Rotation (ACM-178–181), zone delivery fee (ACM-157) and platform holidays.
 */

export class QuoteError extends Error {
    constructor(message, code = 'QUOTE_INVALID', statusCode = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
    }
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const oid = (v) => (v && mongoose.Types.ObjectId.isValid(String(v)) ? String(v) : null);
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ROTATION_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'];

/** The zones a vendor delivers to (Gap X): its delivery zones, or its own zone. */
export const servedZoneIds = (vendor) => {
    const list = (vendor?.deliveryZoneIds || []).map(String).filter(Boolean);
    return list.length ? list : (vendor?.zoneId ? [String(vendor.zoneId)] : []);
};
export const vendorServesZone = (vendor, zoneId) => !zoneId || servedZoneIds(vendor).includes(String(zoneId));

/** Never had an activated subscription and never had a trial → eligible for the first-week offer (ACM-150). */
export const isTrialEligible = async (userId) => {
    if (!userId) return false;
    const prior = await DMBSubscription.exists({
        userId,
        $or: [{ status: { $in: ['active', 'paused', 'cancelled', 'expired'] } }, { isTrial: true, status: { $ne: 'pending_payment' } }]
    });
    if (prior) return false;
    try {
        const { PaymentTransaction } = await import('../../payments/payments.models.js');
        const paid = await PaymentTransaction.exists({ ownerId: userId, purpose: 'subscription', status: { $in: ['paid', 'partially_refunded', 'refunded'] } });
        return !paid;
    } catch {
        return true;
    }
};

/** Slots the customer already holds on each weekday (other live subscriptions), for the ACM-148 limit. */
const existingSlotsByDay = async (userId, { excludeIds = [], from }) => {
    if (!userId) return {};
    const subs = await DMBSubscription.find({
        userId,
        _id: { $nin: excludeIds.filter(Boolean) },
        status: { $in: ['active', 'paused', 'pending_payment'] },
        $or: [{ endDate: null }, { endDate: { $gt: from } }]
    }).lean();
    const byDay = {};
    for (const sub of subs) {
        if (sub.status === 'pending_payment' && Date.now() - new Date(sub.createdAt).getTime() > 60 * 60_000) continue; // abandoned checkout
        for (const day of deliveryWeekdays(sub)) {
            const probe = { ...sub, startDate: null, endDate: null };
            const keys = new Set();
            // Look at one concrete date of that weekday to resolve per-day / family slots.
            const date = addDays(from, (day - from.getUTCDay() + 7) % 7);
            for (const d of deliveriesOn({ ...probe, deliveryPattern: 'every_week' }, date, { ignoreBounds: true })) keys.add(d.slot);
            byDay[day] = new Set([...(byDay[day] || []), ...keys]);
        }
    }
    return byDay;
};

const loadMeals = async (ids) => {
    const docs = await DMBMealPlan.find({ _id: { $in: ids } }).lean();
    return new Map(docs.map((d) => [String(d._id), d]));
};

const avgMenuPrice = async (vendorId) => {
    const plans = await DMBMealPlan.find({ vendorId, status: 'active' }).select('pricePerDay').lean();
    return plans.length ? plans.reduce((s, p) => s + (p.pricePerDay || 0), 0) / plans.length : 0;
};

/**
 * input: { subscriptionPlanId, vendorId, zoneId, startDate, subscriptionType ('dedicated'|'rotation'),
 *          meals: [{ mealPlanId, quantity }], deliverySlots: [...], deliveryDays ('custom' to use deliveryDaysList),
 *          deliveryDaysList: [0..6], daySlots: { "1": ["lunch"] }, familyBox: { members: [{ label, meals, slots }] },
 *          rotation: [{ vendorId, mealPlanId, quantity, days }], replacesSubscriptionId }
 */
export const quoteSubscription = async (input = {}, { userId = null } = {}) => {
    const plan = oid(input.subscriptionPlanId) ? await VendorSubscriptionPlan.findById(input.subscriptionPlanId).lean() : null;
    if (!plan || plan.status !== 'active') throw new QuoteError('This subscription plan is no longer available', 'PLAN_UNAVAILABLE');
    const cycle = cycleFromPlanDuration(plan.duration);
    const zoneId = oid(input.zoneId);
    if (!zoneId) throw new QuoteError('Choose your delivery zone first', 'ZONE_REQUIRED');
    const cityId = await cityIdForZone(zoneId);
    const ctx = { cityId };
    const [customDays, perDay, maxPerDay, annual, trial, fortnight, family, rotationCfg, rotMax, rotTypes, rotMinDays, weekend] = await Promise.all([
        getControl('customDaySelection', ctx), getControl('perDaySlots', ctx), getControl('maxSlotsPerDay', ctx),
        getControl('annualPlan', ctx), getControl('trialOffer', ctx), getControl('fortnightlyPlan', ctx),
        getControl('familyBox', ctx), getControl('smartRotation', ctx), getControl('rotationMaxMakers', ctx),
        getControl('rotationVendorTypes', ctx), getControl('rotationMinDaysPerMaker', ctx), getControl('weekendDelivery', ctx)
    ]);
    if (cycle === 'annual' && !annual.enabled) throw new QuoteError('Annual plans are not available in your area', 'FEATURE_DISABLED');
    if (cycle === 'fortnightly' && !fortnight.enabled) throw new QuoteError('Fortnightly plans are not available in your area', 'FEATURE_DISABLED');

    const isRotation = input.subscriptionType === 'rotation';
    const isFamily = Boolean(input.familyBox?.members?.length);
    if (isRotation && !rotationCfg.enabled) throw new QuoteError('Smart Rotation is not available in your area', 'FEATURE_DISABLED');
    if (isFamily && !family.enabled) throw new QuoteError('Family Box is not available in your area', 'FEATURE_DISABLED');
    if (isRotation && isFamily) throw new QuoteError('A Family Box cannot be combined with Smart Rotation');

    // ── Days ──────────────────────────────────────────────────────────────────────────────────────────
    let deliveryDays = plan.deliveryDays === 'full_week' ? 'full_week' : 'mon_fri';
    let deliveryDaysList;
    if (input.deliveryDays === 'custom' || isRotation) {
        if (!isRotation && !customDays.enabled) throw new QuoteError('Choosing individual delivery days is not available in your area', 'FEATURE_DISABLED');
        deliveryDaysList = cleanWeekdays(input.deliveryDaysList);
        if (!deliveryDaysList.length) throw new QuoteError('Select at least one delivery day');
        deliveryDays = 'custom';
    }
    const weekdays = deliveryDays === 'custom' ? deliveryDaysList : DAY_PRESETS[deliveryDays];
    if (weekdays.includes(6) && !weekend.saturday) throw new QuoteError('Saturday delivery is not available in your area yet', 'WEEKEND_CLOSED');
    if (weekdays.includes(0) && !weekend.sunday) throw new QuoteError('Sunday delivery is not available in your area yet', 'WEEKEND_CLOSED');

    // ── Slots ─────────────────────────────────────────────────────────────────────────────────────────
    const offered = await offeredSlots({ cityId, weekend });
    const offeredMap = new Map(offered.map((s) => [s.key, s]));
    const assertOffered = (key) => {
        if (!offeredMap.has(key)) throw new QuoteError(`The "${key}" delivery slot is not available in your area`, 'SLOT_UNAVAILABLE');
    };
    let deliverySlots = [...new Set((input.deliverySlots || []).map(String).filter(Boolean))];
    let daySlots;
    if (input.daySlots && Object.keys(input.daySlots).length) {
        if (!perDay.enabled) throw new QuoteError('Different slots per day are not available in your area', 'FEATURE_DISABLED');
        daySlots = cleanDaySlots(input.daySlots);
        for (const day of weekdays) {
            if (!daySlots?.[String(day)]?.length) throw new QuoteError(`Choose a delivery slot for ${DAY_NAMES[day]}`);
        }
        for (const key of Object.keys(daySlots)) if (!weekdays.includes(Number(key))) delete daySlots[key];
        Object.values(daySlots).flat().forEach(assertOffered);
        deliverySlots = [...new Set(Object.values(daySlots).flat())];
    }
    let familyMembers;
    if (isFamily) {
        const max = Number(family.maxMembers) || 4;
        familyMembers = input.familyBox.members.map((m, i) => ({
            label: String(m.label || `Person ${i + 1}`).trim().slice(0, 40),
            meals: (m.meals || []).filter((x) => oid(x.mealPlanId)).map((x) => ({ mealPlanId: String(x.mealPlanId), quantity: Math.max(1, Math.min(5, Number(x.quantity) || 1)) })),
            slots: [...new Set((m.slots || []).map(String))]
        }));
        if (familyMembers.length < 2 || familyMembers.length > max) throw new QuoteError(`A Family Box is for 2 to ${max} people`);
        familyMembers.forEach((m) => {
            if (!m.meals.length) throw new QuoteError(`Choose a meal for ${m.label}`);
            if (!m.slots.length) throw new QuoteError(`Choose at least one slot for ${m.label}`);
            m.slots.forEach(assertOffered);
        });
        deliverySlots = [...new Set(familyMembers.flatMap((m) => m.slots))];
    }
    if (!deliverySlots.length) throw new QuoteError('Choose at least one delivery slot');
    deliverySlots.forEach(assertOffered);

    // ── Start date ────────────────────────────────────────────────────────────────────────────────────
    const tomorrow = addDays(localToday(), 1);
    let startDate = input.startDate ? dateOnlyFromStr(String(input.startDate)) : tomorrow;
    if (!startDate) throw new QuoteError('Invalid start date');
    if (startDate < tomorrow) throw new QuoteError('The start date must be tomorrow or later');
    if (startDate > addDays(localToday(), 120)) throw new QuoteError('The start date can be at most 120 days ahead');

    // ── Makers & meals ────────────────────────────────────────────────────────────────────────────────
    let rotation;
    let vendorId = oid(input.vendorId);
    let meals = (input.meals || []).filter((m) => oid(m.mealPlanId)).map((m) => ({ mealPlanId: String(m.mealPlanId), quantity: Math.max(1, Math.min(10, Number(m.quantity) || 1)) }));
    if (isRotation) {
        rotation = (input.rotation || []).map((r) => ({
            vendorId: oid(r.vendorId), mealPlanId: oid(r.mealPlanId), quantity: Math.max(1, Math.min(5, Number(r.quantity) || 1)), days: cleanWeekdays(r.days)
        }));
        const maxMakers = Math.max(2, Number(rotMax.value) || 5);
        if (rotation.length < 2) throw new QuoteError('A rotation needs at least 2 makers');
        if (rotation.length > maxMakers) throw new QuoteError(`A rotation can include at most ${maxMakers} makers`);
        if (rotation.some((r) => !r.vendorId || !r.mealPlanId)) throw new QuoteError('Choose a meal for every maker in your rotation');
        if (new Set(rotation.map((r) => r.vendorId)).size !== rotation.length) throw new QuoteError('Each maker can appear only once in a rotation');
        const minDays = Math.max(1, Number(rotMinDays.value) || 1);
        const seen = new Set();
        for (const r of rotation) {
            if (r.days.length < minDays) throw new QuoteError(`Each maker needs at least ${minDays} day(s) in your rotation`);
            for (const d of r.days) {
                if (seen.has(d)) throw new QuoteError(`${DAY_NAMES[d]} is assigned to two makers`);
                seen.add(d);
            }
        }
        const union = [...seen].sort((a, b) => a - b);
        if (union.join(',') !== weekdays.join(',')) throw new QuoteError('Every delivery day must be assigned to exactly one maker');
        vendorId = rotation[0].vendorId;
        meals = [{ mealPlanId: rotation[0].mealPlanId, quantity: rotation[0].quantity }];
    }
    if (!vendorId) throw new QuoteError('Choose a maker');

    const mealIds = [...new Set([
        ...meals.map((m) => m.mealPlanId),
        ...(familyMembers || []).flatMap((m) => m.meals.map((x) => x.mealPlanId)),
        ...(rotation || []).map((r) => r.mealPlanId)
    ])];
    if (!mealIds.length) throw new QuoteError('Choose a meal');
    const mealMap = await loadMeals(mealIds);
    const vendorIds = [...new Set([vendorId, ...(rotation || []).map((r) => r.vendorId)])];
    const vendors = await FoodRestaurant.find({ _id: { $in: vendorIds } }).select('restaurantName status vendorType zoneId deliveryZoneIds vacationMode isAcceptingOrders deliveryWeekdays cookTrack track1Paused').lean();
    const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));
    const allowedTypes = rotTypes.allowed || [];
    const { blockedCookIds } = await import('../legal/legal.service.js');
    const blockedCooks = await blockedCookIds(vendors);
    for (const id of vendorIds) {
        const v = vendorMap.get(id);
        if (!v || v.status !== 'approved' || blockedCooks.has(id)) throw new QuoteError('This maker is not available', 'VENDOR_UNAVAILABLE');
        if (!vendorServesZone(v, zoneId)) throw new QuoteError(`${v.restaurantName} does not deliver to your zone`, 'ZONE_MISMATCH');
        if (isRotation && v.vendorType && !allowedTypes.includes(v.vendorType)) throw new QuoteError(`${v.restaurantName} cannot be part of a rotation`, 'ROTATION_TYPE');
        const vendorDays = Array.isArray(v.deliveryWeekdays) && v.deliveryWeekdays.length ? v.deliveryWeekdays : null;
        const mustCover = isRotation ? rotation.find((r) => r.vendorId === id).days : weekdays;
        if (vendorDays) {
            const missing = mustCover.filter((d) => !vendorDays.includes(d));
            if (missing.length) throw new QuoteError(`${v.restaurantName} does not deliver on ${missing.map((d) => DAY_NAMES[d]).join(', ')}`, 'VENDOR_DAYS');
        }
    }
    const mealVendor = (mid) => String(mealMap.get(mid)?.vendorId || '');
    for (const mid of mealIds) {
        const meal = mealMap.get(mid);
        if (!meal || meal.status !== 'active') throw new QuoteError('A selected meal is no longer available', 'MEAL_UNAVAILABLE');
    }
    meals.forEach((m) => { if (mealVendor(m.mealPlanId) !== vendorId) throw new QuoteError('A selected meal belongs to another maker'); });
    (familyMembers || []).forEach((fm) => fm.meals.forEach((m) => { if (mealVendor(m.mealPlanId) !== vendorId) throw new QuoteError('Family Box meals must all come from the same maker'); }));
    (rotation || []).forEach((r) => {
        if (mealVendor(r.mealPlanId) !== r.vendorId) throw new QuoteError('A rotation meal does not belong to its maker');
        r.pricePerDay = mealMap.get(r.mealPlanId).pricePerDay;
    });

    // ── Schedule ──────────────────────────────────────────────────────────────────────────────────────
    const draft = {
        startDate, deliveryDays, deliveryDaysList, daySlots, deliverySlots, deliverySlot: deliverySlots[0],
        deliveryPattern: cycle === 'fortnightly' ? 'alternate_weeks' : 'every_week',
        vendorId, meals, subscriptionType: isRotation ? 'rotation' : 'dedicated', rotation,
        familyBox: isFamily ? { enabled: true, members: familyMembers } : undefined
    };
    const holidays = await holidaySetForCity(cityId);
    const period = buildPeriod(draft, { cycle, slotDefs: offered, holidays });
    if (!period.dates.length) throw new QuoteError('None of your chosen days and slots deliver in this period — pick other days or slots', 'NO_DELIVERIES');

    // ACM-148: max concurrent slots per day across the customer's subscriptions.
    const maxSlots = Math.max(1, Number(maxPerDay.value) || 1);
    const existing = await existingSlotsByDay(userId, { excludeIds: [input.replacesSubscriptionId], from: period.startDate });
    for (const day of weekdays) {
        const newKeys = new Set(period.dates.filter((x) => x.date.getUTCDay() === day).flatMap((x) => x.deliveries.map((dv) => dv.slot)));
        const total = new Set([...(existing[day] || []), ...newKeys]).size;
        if (total > maxSlots) {
            throw new QuoteError(maxSlots === 1
                ? `You can have only one delivery slot per day (${DAY_NAMES[day]} already has one)`
                : `You can have at most ${maxSlots} delivery slots per day (${DAY_NAMES[day]})`, 'MAX_SLOTS_PER_DAY');
        }
    }

    // ── Prices ────────────────────────────────────────────────────────────────────────────────────────
    const { fee: deliveryFee, source: feeSource } = await deliveryFeeForZone(zoneId);
    const foodVatRate = Number(plan.foodVat) || 0;
    const deliveryVatRate = Number(plan.deliveryVat) || 0;
    const familyPct = isFamily ? Math.max(0, Math.min(50, Number(family.discountPct) || 0)) : 0;
    const annualPct = cycle === 'annual' ? Math.max(0, Math.min(50, Number(annual.discountPct) || 0)) : 0;
    const avgByVendor = new Map();
    if (plan.applyFoodVatOnMenu) for (const v of vendorIds) avgByVendor.set(v, await avgMenuPrice(v));

    const trialWindowEnd = addDays(period.startDate, 7);
    let trialPct = 0;
    let trialEligible = false;
    if (trial.enabled && cycle !== 'one_day') {
        trialEligible = await isTrialEligible(userId);
        if (trialEligible) trialPct = Math.max(0, Math.min(100, Number(trial.discountPct) || 0));
    }
    const unitPrices = Object.fromEntries(mealIds.map((id) => [id, mealMap.get(id).pricePerDay]));

    const priceOne = (date, dv, pct) => {
        const food = dv.meals.reduce((s, m) => s + (unitPrices[String(m.mealPlanId)] || 0) * (m.quantity || 1), 0);
        const foodAfterFamily = food * (1 - familyPct / 100);
        const factor = 1 - pct / 100;
        const foodNet = foodAfterFamily * factor;
        const fee = deliveryFee * factor;
        const qty = dv.meals.reduce((s, m) => s + (m.quantity || 1), 0);
        const vatBase = plan.applyFoodVatOnMenu ? (avgByVendor.get(String(dv.vendorId)) || 0) * qty * (1 - familyPct / 100) * factor : foodNet;
        return { date: storageDateStr(date), slot: dv.slot, vendorId: String(dv.vendorId), food, foodNet, fee, foodVat: vatBase * foodVatRate / 100, deliveryVat: fee * deliveryVatRate / 100 };
    };

    // Trial min order check uses the undiscounted first week.
    let firstWeekGross = 0;
    for (const { date, deliveries } of period.dates) {
        if (date >= trialWindowEnd) break;
        for (const dv of deliveries) firstWeekGross += priceOne(date, dv, 0).foodNet + deliveryFee;
    }
    const trialApplied = trialPct > 0 && firstWeekGross >= (Number(trial.minOrderAmount) || 0);

    const lines = [];
    let foodGross = 0, foodAfterFamily = 0, foodNet = 0, deliveryGross = 0, deliveryNet = 0, foodVat = 0, deliveryVat = 0, orders = 0;
    for (const { date, deliveries } of period.dates) {
        const pct = Math.max(annualPct, trialApplied && date < trialWindowEnd ? trialPct : 0);
        for (const dv of deliveries) {
            const p = priceOne(date, dv, pct);
            orders++;
            foodGross += p.food;
            foodAfterFamily += p.food * (1 - familyPct / 100);
            foodNet += p.foodNet;
            deliveryGross += deliveryFee;
            deliveryNet += p.fee;
            foodVat += p.foodVat;
            deliveryVat += p.deliveryVat;
        }
    }
    const platformFee = Number(plan.platformFee) || 0;
    const familyDiscount = foodGross - foodAfterFamily;
    const periodDiscount = (foodAfterFamily - foodNet) + (deliveryGross - deliveryNet);
    lines.push({ key: 'food', label: 'Meals', amount: r2(foodGross) });
    if (familyDiscount > 0.004) lines.push({ key: 'family_discount', label: 'Family Box discount', amount: -r2(familyDiscount) });
    if (periodDiscount > 0.004) lines.push({ key: annualPct > 0 ? 'annual_discount' : 'trial_discount', label: annualPct > 0 ? 'Annual plan discount' : 'First-week trial discount', amount: -r2(periodDiscount) });
    if (foodVat > 0.004) lines.push({ key: 'food_vat', label: `Food VAT (${foodVatRate}%)`, amount: r2(foodVat), rate: foodVatRate });
    lines.push({ key: 'delivery', label: 'Delivery', amount: r2(deliveryGross) });
    if (deliveryVat > 0.004) lines.push({ key: 'delivery_vat', label: `Delivery VAT (${deliveryVatRate}%)`, amount: r2(deliveryVat), rate: deliveryVatRate });
    if (platformFee > 0) lines.push({ key: 'platform_fee', label: 'Platform fee (one-time)', amount: r2(platformFee) });
    const total = r2(foodNet + foodVat + deliveryNet + deliveryVat + platformFee);

    const { resolvePaymentContext } = await import('../../payments/payments.settings.js');
    const { currency } = await resolvePaymentContext({ zoneId });
    const colorOf = (vid) => ROTATION_COLORS[(rotation || []).findIndex((r) => r.vendorId === vid) % ROTATION_COLORS.length] || ROTATION_COLORS[0];

    return {
        currency,
        cycle,
        subscriptionPlanId: String(plan._id),
        planName: plan.name,
        zoneId,
        cityId,
        startDate: storageDateStr(period.startDate),
        endDate: storageDateStr(period.endDate),
        deliveryDays,
        deliveryDaysList: deliveryDays === 'custom' ? deliveryDaysList : DAY_PRESETS[deliveryDays],
        deliveryPattern: draft.deliveryPattern,
        deliverySlots,
        daySlots,
        subscriptionType: draft.subscriptionType,
        vendorId,
        meals,
        rotation: rotation?.map((r) => ({ ...r, vendorName: vendorMap.get(r.vendorId)?.restaurantName || '', color: colorOf(r.vendorId), subtotal: r2(period.dates.filter((x) => r.days.includes(x.date.getUTCDay())).reduce((s, x) => s + x.deliveries.length * r.pricePerDay * r.quantity, 0)) })),
        familyBox: isFamily ? { enabled: true, members: familyMembers.map((m) => ({ ...m, perDelivery: r2(m.meals.reduce((s, x) => s + unitPrices[x.mealPlanId] * x.quantity, 0)) })) } : undefined,
        deliveryDates: period.dates.length,
        orders,
        unitPrices,
        deliveryFeePerOrder: r2(deliveryFee),
        deliveryFeeSource: feeSource,
        foodVatRate,
        deliveryVatRate,
        applyFoodVatOnMenu: Boolean(plan.applyFoodVatOnMenu),
        discounts: { familyPct, annualPct, trial: { eligible: trialEligible, applied: trialApplied, pct: trialApplied ? trialPct : 0, endsAt: trialApplied ? storageDateStr(trialWindowEnd) : null, minOrderAmount: Number(trial.minOrderAmount) || 0 } },
        lines,
        totals: { food: r2(foodNet), foodGross: r2(foodGross), foodVat: r2(foodVat), delivery: r2(deliveryNet), deliveryVat: r2(deliveryVat), platformFee: r2(platformFee), discount: r2(familyDiscount + periodDiscount), total },
        preview: period.dates.slice(0, 14).map((x) => ({ date: storageDateStr(x.date), slots: x.deliveries.map((d) => d.slot), vendorId: String(x.deliveries[0]?.vendorId || '') }))
    };
};

/** Price of one generated daily order, using the discounts and unit prices frozen on the subscription. */
export const priceDailyOrder = (sub, date, delivery) => {
    const q = sub.quote || {};
    const unit = q.unitPrices || {};
    const fallbackUnit = Number(sub.pricing?.basePricePerDay) || 0;
    const food = delivery.meals.reduce((s, m) => {
        const price = unit[String(m.mealPlanId)];
        return s + (price !== undefined ? price : fallbackUnit / Math.max(1, (sub.meals || []).length || 1)) * (m.quantity || 1);
    }, 0);
    const familyPct = Number(sub.familyDiscountPct) || 0;
    const inTrial = sub.isTrial && sub.trialEndsAt && new Date(date) < new Date(sub.trialEndsAt);
    const pct = Math.max(Number(sub.annualDiscountPct) || 0, inTrial ? Number(sub.trialDiscountPct) || 0 : 0);
    const factor = 1 - pct / 100;
    const foodCost = r2(food * (1 - familyPct / 100) * factor);
    const deliveryFee = r2((Number(sub.pricing?.deliveryFeePerDay) || 0) * factor);
    const foodVat = Number(sub.pricing?.foodVat) || 0;
    const deliveryVat = Number(sub.pricing?.deliveryVat) || 0;
    const foodVatAmount = r2(foodCost * foodVat / 100);
    const deliveryVatAmount = r2(deliveryFee * deliveryVat / 100);
    return {
        foodCost, foodVat, foodVatAmount, deliveryFee, deliveryVat, deliveryVatAmount, platformFee: 0,
        totalPrice: r2(foodCost + foodVatAmount + deliveryFee + deliveryVatAmount),
        currency: sub.pricing?.currency || 'PLN'
    };
};

/** Fields to persist on the subscription from an accepted quote. */
export const subscriptionFieldsFromQuote = (q) => ({
    subscriptionPlanId: q.subscriptionPlanId,
    billingCycle: q.cycle,
    duration: q.cycle,
    startDate: dateOnlyFromStr(q.startDate),
    endDate: dateOnlyFromStr(q.endDate),
    nextDeliveryDate: dateOnlyFromStr(q.preview[0]?.date || q.startDate),
    billingCycleStart: dateOnlyFromStr(q.startDate),
    deliveryDays: q.deliveryDays,
    deliveryDaysList: q.deliveryDays === 'custom' ? q.deliveryDaysList : undefined,
    deliveryPattern: q.deliveryPattern,
    deliverySlot: q.deliverySlots[0],
    deliverySlots: q.deliverySlots,
    daySlots: q.daySlots,
    subscriptionType: q.subscriptionType,
    vendorId: q.vendorId,
    meals: q.meals,
    mealPlanId: q.meals[0]?.mealPlanId,
    rotation: q.rotation?.map(({ vendorId, mealPlanId, quantity, days, pricePerDay }) => ({ vendorId, mealPlanId, quantity, days, pricePerDay })),
    familyBox: q.familyBox ? { enabled: true, members: q.familyBox.members.map(({ label, meals, slots }) => ({ label, meals, slots })) } : undefined,
    isTrial: q.discounts.trial.applied,
    trialDiscountPct: q.discounts.trial.pct,
    trialEndsAt: q.discounts.trial.endsAt ? dateOnlyFromStr(q.discounts.trial.endsAt) : null,
    annualDiscountPct: q.discounts.annualPct,
    familyDiscountPct: q.discounts.familyPct,
    quote: { ...q, preview: undefined },
    pricing: {
        basePricePerDay: r2(q.meals.reduce((s, m) => s + (q.unitPrices[m.mealPlanId] || 0) * m.quantity, 0)),
        deliveryFeePerDay: q.deliveryFeePerOrder,
        foodVat: q.foodVatRate,
        deliveryVat: q.deliveryVatRate,
        platformFee: q.totals.platformFee,
        foodVatAmount: q.totals.foodVat,
        deliveryVatAmount: q.totals.deliveryVat,
        platformFeeAmount: q.totals.platformFee,
        applyFoodVatOnMenu: q.applyFoodVatOnMenu,
        totalPerWeek: q.totals.total,
        totalPrice: q.totals.total,
        currency: q.currency
    }
});
