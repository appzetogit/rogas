import { addDays, storageDateStr } from '../../../utils/platformTime.js';

/**
 * Delivery schedule of a subscription — the single place that answers "what gets delivered on date D?".
 * Used by the price quote, daily-order generation, the 10-day calendar, holiday handling and plan changes, so they
 * can never disagree.
 *
 * Day numbers are JS days (0 = Sunday … 6 = Saturday). Dates are storage dates (UTC midnight of the local date).
 */

export const DAY_PRESETS = {
    mon_fri: [1, 2, 3, 4, 5],
    full_week: [0, 1, 2, 3, 4, 5, 6]
};

/** billing cycle → { duration code stored on the subscription, calendar length in days, delivery pattern } */
export const BILLING_CYCLES = {
    one_day: { planDuration: 'day', label: 'One Day' },
    weekly: { planDuration: 'week', label: 'Weekly' },
    fortnightly: { planDuration: 'fortnight', label: 'Fortnightly' },
    monthly: { planDuration: 'month', label: 'Monthly' },
    annual: { planDuration: 'year', label: 'Annual' }
};

export const cycleFromPlanDuration = (duration) => ({ day: 'one_day', week: 'weekly', fortnight: 'fortnightly', month: 'monthly', year: 'annual' }[duration] || 'weekly');

const uniqSortedDays = (days) => [...new Set((days || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);

/** The weekdays a subscription delivers on. `custom` uses deliveryDaysList; the presets ignore it. */
export const deliveryWeekdays = (sub) => {
    if (sub?.deliveryDays === 'custom') return uniqSortedDays(sub.deliveryDaysList);
    if (Array.isArray(sub?.rotation) && sub.rotation.length && sub?.subscriptionType === 'rotation') {
        return uniqSortedDays(sub.rotation.flatMap((r) => r.days || []));
    }
    return DAY_PRESETS[sub?.deliveryDays] || DAY_PRESETS.mon_fri;
};

/**
 * Calendar length (days) of one billing period. Monthly keeps the existing plan semantics (20 deliveries Mon–Fri =
 * 4 weeks, 30 days for a full week); annual is 52 weeks (365 days for a full week).
 */
export const periodLengthDays = (cycle, deliveryDays) => {
    const full = deliveryDays === 'full_week';
    switch (cycle) {
        case 'one_day': return 1;
        case 'weekly': return 7;
        case 'fortnightly': return 14;
        case 'monthly': return full ? 30 : 28;
        case 'annual': return full ? 365 : 364;
        default: return 7;
    }
};

/** Fortnightly subscriptions deliver in alternate weeks: weeks 0, 2, 4 … counted from the start date. */
export const isDeliveryWeek = (sub, date) => {
    if (sub?.deliveryPattern !== 'alternate_weeks') return true;
    const start = new Date(sub.startDate).getTime();
    const weekIndex = Math.floor((new Date(date).getTime() - start) / (7 * 86_400_000));
    return weekIndex % 2 === 0;
};

/** Slots on a given weekday: per-day slots (ACM-147) when set, else the subscription's slots. */
export const slotsForWeekday = (sub, dow) => {
    const perDay = sub?.daySlots;
    if (perDay && typeof perDay === 'object') {
        const own = perDay instanceof Map ? perDay.get(String(dow)) : perDay[String(dow)];
        if (Array.isArray(own) && own.length) return own;
        if (Object.keys(perDay instanceof Map ? Object.fromEntries(perDay) : perDay).length) return [];
    }
    if (sub?.familyBox?.enabled && Array.isArray(sub.familyBox.members)) {
        return [...new Set(sub.familyBox.members.flatMap((m) => m.slots || []))];
    }
    if (Array.isArray(sub?.deliverySlots) && sub.deliverySlots.length) return sub.deliverySlots;
    return sub?.deliverySlot ? [sub.deliverySlot] : [];
};

const slotOffered = (slotDefs, key, dow) => {
    if (!slotDefs) return true;
    const def = slotDefs.find((s) => s.key === key);
    if (!def) return false;
    if (def.isEnabled === false && def.status !== 'deactivating') return false;
    return (def.availableDays || []).includes(dow);
};

/** Delivery address for a weekday: a per-day address (Gap V) when set, else the subscription's address. */
export const addressForWeekday = (sub, dow) => {
    const own = (sub?.dayAddresses || []).find((d) => Number(d.day) === dow);
    return own?.address || sub?.deliveryAddress || null;
};

/**
 * Everything delivered on `date` for this subscription (ignores status — callers decide whether the subscription is
 * live). Returns [] when nothing is due. Each entry: { slot, vendorId, meals: [{ mealPlanId, quantity, memberLabel }], address }.
 *
 * opts.slotDefs   DeliverySlot list (to drop slots not offered that weekday)
 * opts.holidays   Set of 'YYYY-MM-DD' confirmed holidays applying to this subscription
 * opts.ignoreBounds  skip the start/end date check (used while building a new schedule)
 */
export const deliveriesOn = (sub, date, { slotDefs = null, holidays = null, ignoreBounds = false } = {}) => {
    const d = new Date(date);
    const key = storageDateStr(d);
    if (!ignoreBounds) {
        if (sub.startDate && d < new Date(storageDateStr(sub.startDate))) return [];
        if (sub.endDate && d >= new Date(storageDateStr(sub.endDate))) return [];
        if (sub.cancelAt && d >= new Date(storageDateStr(sub.cancelAt))) return [];
    }
    if (holidays && holidays.has(key)) return [];
    const dow = d.getUTCDay();
    if (!deliveryWeekdays(sub).includes(dow)) return [];
    if (!isDeliveryWeek(sub, d)) return [];

    let vendorId = sub.vendorId?._id || sub.vendorId;
    let baseMeals = (sub.meals || []).map((m) => ({ mealPlanId: m.mealPlanId?._id || m.mealPlanId, quantity: m.quantity || 1 }));
    if (sub.subscriptionType === 'rotation' && Array.isArray(sub.rotation)) {
        const maker = sub.rotation.find((r) => (r.days || []).map(Number).includes(dow));
        if (!maker) return [];
        vendorId = maker.vendorId?._id || maker.vendorId;
        baseMeals = [{ mealPlanId: maker.mealPlanId?._id || maker.mealPlanId, quantity: maker.quantity || 1 }];
    }

    const address = addressForWeekday(sub, dow);
    const out = [];
    for (const slot of slotsForWeekday(sub, dow)) {
        if (!slotOffered(slotDefs, slot, dow)) continue;
        let meals = baseMeals;
        if (sub.familyBox?.enabled && Array.isArray(sub.familyBox.members)) {
            meals = sub.familyBox.members
                .filter((m) => (m.slots || []).includes(slot))
                .flatMap((m) => (m.meals || []).map((x) => ({ mealPlanId: x.mealPlanId?._id || x.mealPlanId, quantity: x.quantity || 1, memberLabel: m.label })));
            if (!meals.length) continue;
        }
        out.push({ slot, vendorId, meals, address });
    }
    return out;
};

/**
 * All deliveries of a new subscription period: from startDate for the cycle's calendar length.
 * Returns { endDate (exclusive), dates: [{ date, deliveries }] } — dates without deliveries are omitted.
 */
export const buildPeriod = (sub, { cycle, slotDefs = null, holidays = null } = {}) => {
    const start = new Date(storageDateStr(sub.startDate));
    const len = periodLengthDays(cycle, sub.deliveryDays);
    const dates = [];
    if (cycle === 'one_day') {
        // One delivery day: the first date on or after the start that has something to deliver.
        for (let i = 0; i < 14; i++) {
            const day = addDays(start, i);
            const deliveries = deliveriesOn(sub, day, { slotDefs, holidays, ignoreBounds: true });
            if (deliveries.length) {
                dates.push({ date: day, deliveries });
                return { endDate: addDays(day, 1), dates, startDate: day };
            }
        }
        return { endDate: addDays(start, 1), dates, startDate: start };
    }
    for (let i = 0; i < len; i++) {
        const day = addDays(start, i);
        const deliveries = deliveriesOn(sub, day, { slotDefs, holidays, ignoreBounds: true });
        if (deliveries.length) dates.push({ date: day, deliveries });
    }
    return { endDate: addDays(start, len), dates, startDate: start };
};

/**
 * Moves an end date later until `extra` more delivery days fall inside the subscription (used when a holiday or a
 * vendor closure removes deliveries the customer already paid for). Returns the new exclusive end date.
 */
export const extendEndDateByDeliveries = (sub, extra, { slotDefs = null, holidays = null } = {}) => {
    let end = new Date(storageDateStr(sub.endDate));
    let added = 0;
    for (let guard = 0; added < extra && guard < 400; guard++) {
        const deliveries = deliveriesOn(sub, end, { slotDefs, holidays, ignoreBounds: true });
        end = addDays(end, 1);
        if (deliveries.length) added++;
    }
    return end;
};

/** Validates per-day slot / custom-day structures coming from a client. Returns cleaned values or throws. */
export const cleanDaySlots = (daySlots) => {
    if (!daySlots || typeof daySlots !== 'object') return undefined;
    const out = {};
    for (const [k, v] of Object.entries(daySlots)) {
        const day = Number(k);
        if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error(`Invalid weekday "${k}" in per-day slots`);
        const slots = [...new Set((Array.isArray(v) ? v : [v]).map((s) => String(s || '').trim()).filter(Boolean))];
        if (slots.length) out[String(day)] = slots;
    }
    return Object.keys(out).length ? out : undefined;
};

export const cleanWeekdays = uniqSortedDays;
