import { DMBSubscription } from './subscription.model.js';
import { DMBOneTimeOrder } from '../orders/orders.models.js';
import { deliveriesOn, addressForWeekday } from './schedule.js';
import { addDays, dateOnlyFromStr, storageDateStr } from '../../../utils/platformTime.js';

/**
 * One delivery fee per slot: a customer who already has something arriving in the same zone, on the same day and slot,
 * does not pay a second delivery fee — the new items ride on the same trip. The fee belongs to whichever order was
 * bought first; if that one is cancelled later nobody is charged extra.
 *
 * A "delivery key" is `YYYY-MM-DD:slotKey`.
 *
 * Seniority: only things bought BEFORE `before` can cover a delivery. Without that rule two plans sharing a slot would
 * cover each other once one of them renews and nobody would ever pay the fee. A renewal inherits the seniority of the
 * subscription it replaces.
 */
export const deliveryKey = (date, slot) => `${typeof date === 'string' ? date : storageDateStr(date)}:${slot}`;

const ABANDONED_CHECKOUT_MS = 60 * 60_000;

/**
 * The delivery keys, among `dates`, that an EARLIER live subscription of the customer already sends through a hub (it paid the
 * flat cross-zone surcharge for that slot). The surcharge is once per slot, never per vendor.
 */
export const coveredCrossZoneKeys = async ({ userId, dates, excludeSubscriptionIds = [], before = new Date() }) => {
    const keys = new Set();
    if (!userId || !dates?.length) return keys;
    const days = dates.map((d) => dateOnlyFromStr(d));
    const subs = await DMBSubscription.find({
        userId, _id: { $nin: excludeSubscriptionIds.filter(Boolean) }, status: { $in: ['active', 'pending_payment'] }, source: { $ne: 'office' },
        'quote.crossZoneKeys.0': { $exists: true }, startDate: { $lte: new Date(Math.max(...days)) }
    }).select('quote.crossZoneKeys feeSeniorityAt createdAt status').lean();
    const wanted = new Set(dates);
    const singles = await DMBOneTimeOrder.find({
        userId, crossZone: true, createdAt: { $lt: before }, status: { $in: ['paid', 'pending_payment'] },
        deliveryDate: { $gte: new Date(Math.min(...days)), $lt: addDays(new Date(Math.max(...days)), 1) }
    }).select('deliveryDate deliverySlot status createdAt').lean();
    for (const o of singles) {
        if (o.status === 'pending_payment' && Date.now() - new Date(o.createdAt).getTime() > ABANDONED_CHECKOUT_MS) continue;
        keys.add(deliveryKey(o.deliveryDate, o.deliverySlot));
    }
    for (const sub of subs) {
        if (new Date(sub.feeSeniorityAt || sub.createdAt) >= before) continue;
        if (sub.status === 'pending_payment' && Date.now() - new Date(sub.createdAt).getTime() > ABANDONED_CHECKOUT_MS) continue;
        for (const k of sub.quote.crossZoneKeys) if (wanted.has(k.split(':')[0])) keys.add(k);
    }
    return keys;
};

/**
 * The delivery keys, among `dates` (YYYY-MM-DD strings), that the customer already has a delivery for in `zoneId`:
 *   - their other live subscriptions (company-paid office plans go to the office address, so they never count),
 *   - their single-meal and pre-order deliveries,
 *   - their paid pantry bags.
 * `excludeSubscriptionIds` are the subscriptions being replaced by the one being priced.
 */
export const coveredDeliveryKeys = async ({ userId, zoneId, dates, excludeSubscriptionIds = [], before = new Date() }) => {
    const covered = new Set();
    if (!userId || !dates?.length) return covered;
    const days = dates.map((d) => dateOnlyFromStr(d));
    const first = new Date(Math.min(...days));
    const last = new Date(Math.max(...days));
    const sameZone = (z) => !zoneId || !z || String(z) === String(zoneId);

    // Other live subscriptions, from their schedule (orders are only generated a few days ahead).
    const subs = await DMBSubscription.find({
        userId,
        _id: { $nin: excludeSubscriptionIds.filter(Boolean) },
        status: { $in: ['active', 'pending_payment'] },
        source: { $ne: 'office' },
        startDate: { $lte: last },
        $or: [{ endDate: null }, { endDate: { $gt: first } }]
    }).lean();
    for (const sub of subs) {
        if (new Date(sub.feeSeniorityAt || sub.createdAt) >= before) continue; // bought after: it is the one riding on us
        if (sub.status === 'pending_payment' && Date.now() - new Date(sub.createdAt).getTime() > ABANDONED_CHECKOUT_MS) continue;
        for (const date of days) {
            if (sub.pausedUntil && date <= new Date(sub.pausedUntil)) continue;
            for (const d of deliveriesOn(sub, date)) {
                const address = addressForWeekday(sub, date.getUTCDay());
                if (sameZone(address?.zoneId || sub.zoneId)) covered.add(deliveryKey(date, d.slot));
            }
        }
    }

    // Single meals and pre-orders already booked for those days.
    const singles = await DMBOneTimeOrder.find({
        userId, createdAt: { $lt: before },
        deliveryDate: { $gte: first, $lt: addDays(last, 1) },
        status: { $in: ['paid', 'reserved', 'payment_pending', 'pending_payment'] }
    }).select('deliveryDate deliverySlot zoneId status createdAt').lean();
    for (const o of singles) {
        if (o.status === 'pending_payment' && Date.now() - new Date(o.createdAt).getTime() > ABANDONED_CHECKOUT_MS) continue;
        if (sameZone(o.zoneId)) covered.add(deliveryKey(o.deliveryDate, o.deliverySlot));
    }

    // Paid pantry bags.
    const { PantryOrder } = await import('../../food/restaurant/models/pantryOrder.model.js');
    const bags = await PantryOrder.find({ userId, status: 'paid', createdAt: { $lt: before }, 'dailyDeliveries.date': { $gte: first, $lt: addDays(last, 1) } }).select('dailyDeliveries.date dailyDeliveries.slot dailyDeliveries.status').lean();
    for (const po of bags) {
        for (const dd of po.dailyDeliveries) {
            if (dd.date >= first && dd.date < addDays(last, 1) && !['failed'].includes(dd.status)) covered.add(deliveryKey(dd.date, dd.slot));
        }
    }
    return covered;
};
