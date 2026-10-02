import { DeliverySlot } from './deliverySlot.model.js';
import { listSlots } from './deliverySlot.service.js';
import { notify } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';
import { logger } from '../../../utils/logger.js';
import { localToday, addDays, storageDateStr } from '../../../utils/platformTime.js';

/**
 * Gap A — moving subscribers off a slot the admin is discontinuing.
 *   1. deactivateSlot() flags every subscription using the slot (needsSlotChange) and tells the customer.
 *   2. The customer picks a replacement in the app (replaceSubscriptionSlot) at any time during the grace period.
 *   3. When the grace period ends, migrateExpiredSlots() moves whoever is left to the fallback slot (audited).
 */

const SUB_STATUSES = ['active', 'paused', 'pending_payment'];
const usesSlotQuery = (key) => ({
    status: { $in: SUB_STATUSES },
    $or: [{ deliverySlot: key }, { deliverySlots: key }, { daySlotKeys: key }, { 'familyBox.members.slots': key }]
});

export const flagSubscriptionsForSlotChange = async (slot) => {
    const { DMBSubscription } = await import('../subscription/subscription.model.js');
    const subs = await DMBSubscription.find(usesSlotQuery(slot.key)).select('_id userId subscriptionId').lean();
    if (!subs.length) return 0;
    await DMBSubscription.updateMany(
        { _id: { $in: subs.map((s) => s._id) } },
        { $set: { needsSlotChange: true }, $addToSet: { slotChangeKeys: slot.key } }
    );
    const deadline = slot.graceEndsAt ? storageDateStr(slot.graceEndsAt) : '';
    const notified = new Set();
    for (const sub of subs) {
        if (notified.has(String(sub.userId))) continue;
        notified.add(String(sub.userId));
        await notify({
            to: 'customer',
            id: sub.userId,
            event: 'slot_discontinued',
            title: msg('Your delivery slot is being discontinued'),
            body: msg('The {{slot}} slot is being discontinued. Please choose a new slot by {{date}} — otherwise we will move you to {{fallback}}.', { slot: slot.name, date: deadline, fallback: slot.fallbackSlotKey || '-' }),
            link: '/user/profile',
            data: { slotKey: slot.key, subscriptionId: String(sub.subscriptionId || sub._id) },
            email: {
                subjectKey: 'Your delivery slot is being discontinued',
                bodyKey: 'The {{slot}} delivery slot is being discontinued. Open the app and choose a new slot before {{date}}. If you do nothing, your deliveries will move to the {{fallback}} slot.',
                vars: { slot: slot.name, date: deadline, fallback: slot.fallbackSlotKey || '-' }
            }
        });
    }
    return subs.length;
};

const swapKey = (list, from, to) => {
    const out = (list || []).map((k) => (k === from ? to : k));
    return [...new Set(out)];
};

/** Replaces one slot key with another everywhere in a subscription document (in memory; caller saves). */
export const applySlotReplacement = (sub, from, to) => {
    if (sub.deliverySlot === from) sub.deliverySlot = to;
    if (Array.isArray(sub.deliverySlots)) sub.deliverySlots = swapKey(sub.deliverySlots, from, to);
    if (sub.daySlots && typeof sub.daySlots === 'object') {
        const next = {};
        const entries = sub.daySlots instanceof Map ? [...sub.daySlots.entries()] : Object.entries(sub.daySlots);
        for (const [day, keys] of entries) next[day] = swapKey(keys, from, to);
        sub.daySlots = next;
        sub.markModified?.('daySlots');
    }
    if (sub.familyBox?.members?.length) {
        for (const m of sub.familyBox.members) m.slots = swapKey(m.slots, from, to);
        sub.markModified?.('familyBox');
    }
    sub.slotChangeKeys = (sub.slotChangeKeys || []).filter((k) => k !== from);
    sub.needsSlotChange = sub.slotChangeKeys.length > 0;
    if (!sub.deliverySlot && sub.deliverySlots?.length) sub.deliverySlot = sub.deliverySlots[0];
    return sub;
};

/** Removes not-yet-prepared orders of the old slot from tomorrow on; they are regenerated with the new slot. */
const dropFutureOrders = async (subId, slotKey) => {
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const from = addDays(localToday(), 1);
    await DMBDailyOrder.deleteMany({ subscriptionId: subId, deliverySlot: slotKey, deliveryDate: { $gte: from }, status: 'scheduled' });
};

/** Customer chooses a replacement for a discontinued slot. */
export const replaceSubscriptionSlot = async ({ userId, subscriptionId, fromSlot, toSlot }) => {
    const { DMBSubscription } = await import('../subscription/subscription.model.js');
    const sub = await DMBSubscription.findOne({ userId, $or: [{ subscriptionId }, ...(/^[0-9a-f]{24}$/i.test(subscriptionId) ? [{ _id: subscriptionId }] : [])] });
    if (!sub) throw new Error('Subscription not found');
    const target = (await listSlots()).find((s) => s.key === toSlot);
    if (!target || target.status !== 'active') throw new Error('Choose one of the currently offered slots');
    const current = new Set([sub.deliverySlot, ...(sub.deliverySlots || []), ...(sub.daySlotKeys || []), ...((sub.familyBox?.members || []).flatMap((m) => m.slots || []))]);
    if (!current.has(fromSlot)) throw new Error('This subscription does not use that slot');
    applySlotReplacement(sub, fromSlot, toSlot);
    await sub.save();
    await dropFutureOrders(sub._id, fromSlot);
    try {
        const { ensureOrdersForUser } = await import('../subscription/dmb.dailyOrder.service.js');
        await ensureOrdersForUser(sub.userId);
    } catch (err) {
        logger.warn(`[slots] could not regenerate orders after slot change: ${err.message}`);
    }
    return sub.toObject();
};

/** Job: slots whose grace period ended → move remaining subscribers to the fallback slot, then disable the slot. */
export const migrateExpiredSlots = async (now = new Date()) => {
    const { DMBSubscription } = await import('../subscription/subscription.model.js');
    const due = await DeliverySlot.find({ status: 'deactivating', graceEndsAt: { $lte: now } });
    let moved = 0;
    for (const slot of due) {
        const fallback = slot.fallbackSlotKey || (await DeliverySlot.findOne({ status: 'active' }).sort({ sortOrder: 1 }).lean())?.key;
        const subs = await DMBSubscription.find(usesSlotQuery(slot.key));
        for (const sub of subs) {
            if (!fallback) break;
            applySlotReplacement(sub, slot.key, fallback);
            await sub.save();
            await dropFutureOrders(sub._id, slot.key);
            moved++;
            await notify({
                to: 'customer',
                id: sub.userId,
                event: 'slot_discontinued',
                title: msg('Your delivery slot has changed'),
                body: msg('The {{slot}} slot has been discontinued, so your deliveries now come in the {{fallback}} slot. You can change this in your subscription.', { slot: slot.name, fallback }),
                link: '/user/profile'
            });
        }
        slot.status = 'disabled';
        slot.isEnabled = false;
        slot.migratedAt = now;
        await slot.save();
        try {
            const { AdminAuditLog } = await import('../../food/admin/models/auditLog.model.js');
            await AdminAuditLog.create({
                action: 'slot.force_migrate', entityType: 'DeliverySlot', entityId: String(slot._id), actorRole: 'SYSTEM',
                previousValue: { slot: slot.key }, newValue: { fallback, subscriptionsMoved: subs.length }, reason: 'Grace period ended'
            });
        } catch { /* audit is best-effort */ }
        logger.info(`[slots] ${slot.key} retired: ${subs.length} subscriptions moved to ${fallback}`);
    }
    return { slots: due.length, moved };
};
