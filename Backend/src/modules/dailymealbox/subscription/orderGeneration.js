import { DMBDailyOrder } from './dmb.dailyOrder.model.js';
import { deliveriesOn } from './schedule.js';
import { priceDailyOrder } from './pricing.service.js';
import { holidaySetForZone } from '../platform/holiday.service.js';
import { listSlots } from '../deliverySlot/deliverySlot.service.js';
import { addDays, localToday, storageDateStr } from '../../../utils/platformTime.js';
import { logger } from '../../../utils/logger.js';

/**
 * Turns a subscription's schedule into DMBDailyOrder rows. Idempotent (one row per subscription/date/slot, enforced by
 * a unique index). Everything about *what* is delivered comes from schedule.deliveriesOn(); *price* from
 * pricing.priceDailyOrder() — the same functions the checkout quote used, so orders always match what was paid.
 */

const mealInfoCache = new Map();
const mealInfo = async (mealPlanId) => {
    const key = String(mealPlanId);
    const hit = mealInfoCache.get(key);
    if (hit && Date.now() - hit.at < 60_000) return hit.value;
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const doc = await DMBMealPlan.findById(mealPlanId).select('name temperatureType').lean();
    const value = { name: doc?.name || '', temperatureType: doc?.temperatureType || null };
    mealInfoCache.set(key, { at: Date.now(), value });
    return value;
};

const dishName = async ({ vendorId, mealPlanId, date, slot }) => {
    const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
    let menu = await DMBDailyMenu.findOne({ vendorId, mealPlanId, date, slot }).select('dishName').lean();
    if (!menu) menu = await DMBDailyMenu.findOne({ vendorId, date, slot }).select('dishName').lean();
    return menu?.dishName || '';
};

/** Creates the missing orders of one subscription on one date. Returns the number created. */
export const materializeDate = async (sub, date, { slotDefs, holidays }) => {
    const deliveries = deliveriesOn(sub, date, { slotDefs, holidays });
    let created = 0;
    for (const dv of deliveries) {
        const exists = await DMBDailyOrder.exists({ subscriptionId: sub._id, deliveryDate: date, deliverySlot: dv.slot });
        if (exists) continue;
        const meals = [];
        for (const m of dv.meals) {
            const info = await mealInfo(m.mealPlanId);
            const name = (await dishName({ vendorId: dv.vendorId, mealPlanId: m.mealPlanId, date, slot: dv.slot })) || 'No meal set';
            meals.push({ mealPlanId: m.mealPlanId, name, quantity: m.quantity || 1, memberLabel: m.memberLabel || '', temperatureType: info.temperatureType });
        }
        const sets = new Set(meals.map((m) => m.memberLabel).filter(Boolean));
        try {
            await DMBDailyOrder.create({
                orderType: 'subscription',
                subscriptionId: sub._id,
                userId: sub.userId,
                vendorId: dv.vendorId,
                zoneId: sub.zoneId || null,
                meals,
                isFamilyBox: Boolean(sub.familyBox?.enabled),
                setCount: Math.max(1, sets.size),
                hasColdMeal: meals.some((m) => m.temperatureType === 'cold'),
                deliveryDate: date,
                deliverySlot: dv.slot,
                status: 'scheduled',
                pricing: priceDailyOrder(sub, date, dv),
                deliveryAddress: dv.address || sub.deliveryAddress
            });
            created++;
        } catch (err) {
            if (err?.code !== 11000) logger.warn(`[orders] ${sub.subscriptionId} ${storageDateStr(date)} ${dv.slot}: ${err.message}`);
        }
    }
    return created;
};

/** Orders for every active subscription on one date (the vendor's daily run). */
export const generateForDate = async (targetDate) => {
    const { DMBSubscription } = await import('./subscription.model.js');
    const date = new Date(storageDateStr(targetDate));
    const slotDefs = await listSlots();
    const subs = await DMBSubscription.find({
        status: 'active',
        startDate: { $lte: date },
        $or: [{ endDate: null }, { endDate: { $gt: date } }]
    }).lean();
    let created = 0;
    const holidayCache = new Map();
    for (const sub of subs) {
        const zoneKey = String(sub.zoneId || '');
        if (!holidayCache.has(zoneKey)) holidayCache.set(zoneKey, await holidaySetForZone(sub.zoneId));
        created += await materializeDate(sub, date, { slotDefs, holidays: holidayCache.get(zoneKey) });
    }
    return { created, subscriptions: subs.length, date: storageDateStr(date) };
};

/** Orders for one customer from today for `days` days (the calendar preview window, ACM-171). */
export const generateForUser = async (userId, { days = 10 } = {}) => {
    const { DMBSubscription } = await import('./subscription.model.js');
    const today = localToday();
    const subs = await DMBSubscription.find({ userId, status: 'active' }).lean();
    if (!subs.length) return { created: 0 };
    const slotDefs = await listSlots();
    let created = 0;
    for (const sub of subs) {
        const holidays = await holidaySetForZone(sub.zoneId);
        for (let i = 0; i < Math.max(1, Math.min(days, 14)); i++) {
            created += await materializeDate(sub, addDays(today, i), { slotDefs, holidays });
        }
    }
    return { created };
};

/** Scheduled job: makes sure today's and tomorrow's orders exist for every active subscription (vendors, drivers and
 *  dispatch read them; customers' calendars generate further ahead on demand). */
export const generateUpcomingOrders = async (now = new Date()) => {
    const today = localToday(now);
    const out = [];
    for (const date of [today, addDays(today, 1)]) out.push(await generateForDate(date));
    return out;
};
