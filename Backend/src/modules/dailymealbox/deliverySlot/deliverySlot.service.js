import { DeliverySlot } from './deliverySlot.model.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const KEY_RE = /^[a-z][a-z0-9_]{1,29}$/;

const DEFAULT_SLOTS = [
    { key: 'breakfast', name: 'Breakfast', icon: '🌅', color: '#f59e0b', startTime: '04:00', endTime: '10:00', maxPrepMinutes: 60, sortOrder: 1 },
    { key: 'lunch', name: 'Lunch', icon: '☀️', color: '#10b981', startTime: '11:00', endTime: '15:00', maxPrepMinutes: 60, sortOrder: 2 },
    { key: 'dinner', name: 'Dinner', icon: '🌙', color: '#6366f1', startTime: '17:00', endTime: '21:00', maxPrepMinutes: 90, sortOrder: 3 }
];

let seedPromise = null;

/** Seeds Breakfast/Lunch/Dinner once (from the legacy timing document when present) so existing data keeps working. */
export const ensureDefaultSlots = async () => {
    if (!seedPromise) {
        seedPromise = (async () => {
            if (await DeliverySlot.estimatedDocumentCount() > 0) return;
            const { VendorTimingSettings } = await import('../../food/admin/models/vendorTimingSettings.model.js');
            const legacy = await VendorTimingSettings.findOne({ isActive: true }).lean();
            const docs = DEFAULT_SLOTS.map((d) => {
                const l = legacy?.[d.key];
                return l ? {
                    ...d,
                    startTime: l.startTime || d.startTime,
                    endTime: l.endTime || d.endTime,
                    maxPrepMinutes: l.maxPrepMinutes || d.maxPrepMinutes,
                    isEnabled: l.isEnabled !== false
                } : d;
            });
            try {
                await DeliverySlot.insertMany(docs, { ordered: false });
            } catch (err) {
                // Another process seeded first; the unique key index rejected the duplicates.
                if (err.code !== 11000) throw err;
            }
        })().catch((e) => { seedPromise = null; throw e; });
    }
    return seedPromise;
};

export const listSlots = async ({ onlyEnabled = false } = {}) => {
    await ensureDefaultSlots();
    const q = onlyEnabled ? { isEnabled: true } : {};
    return DeliverySlot.find(q).sort({ sortOrder: 1, startTime: 1 }).lean();
};

export const getSlotKeys = async ({ onlyEnabled = false } = {}) =>
    (await listSlots({ onlyEnabled })).map((s) => s.key);

/** Returns the requested key if it is a real, enabled slot; otherwise throws. */
export const assertValidSlotKeys = async (keys, { allowDisabled = false } = {}) => {
    const list = Array.isArray(keys) ? keys : [keys];
    const valid = new Set(await getSlotKeys({ onlyEnabled: !allowDisabled }));
    const bad = list.filter((k) => !valid.has(String(k)));
    if (bad.length) throw new Error(`Invalid or unavailable delivery slot: ${bad.join(', ')}`);
    return list;
};

export const getSlotLabel = (slots, key) => slots.find((s) => s.key === key)?.name;

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

const sanitize = (body, { partial = false } = {}) => {
    const out = {};
    if (body.name !== undefined || !partial) {
        const name = String(body.name || '').trim();
        if (!name) throw new Error('Slot name is required');
        out.name = name.slice(0, 40);
    }
    if (body.description !== undefined) out.description = String(body.description).trim().slice(0, 200);
    if (body.icon !== undefined) out.icon = String(body.icon).slice(0, 8);
    if (body.color !== undefined) out.color = String(body.color).slice(0, 20);

    for (const f of ['startTime', 'endTime']) {
        if (body[f] !== undefined || !partial) {
            if (!HHMM.test(body[f] || '')) throw new Error(`${f} must be in HH:MM format`);
            out[f] = body[f];
        }
    }
    for (const f of ['deliveryStartTime', 'deliveryEndTime']) {
        if (body[f] !== undefined) {
            if (body[f] && !HHMM.test(body[f])) throw new Error(`${f} must be in HH:MM format`);
            out[f] = body[f] || '';
        }
    }
    if (body.maxPrepMinutes !== undefined) {
        const v = num(body.maxPrepMinutes, 0);
        if (v < 1) throw new Error('maxPrepMinutes must be at least 1');
        out.maxPrepMinutes = v;
    }
    if (body.orderCutoffHours !== undefined) out.orderCutoffHours = Math.max(0, num(body.orderCutoffHours, 0));
    if (body.availableDays !== undefined) {
        const days = [...new Set((Array.isArray(body.availableDays) ? body.availableDays : []).map(Number))].filter((d) => d >= 0 && d <= 6);
        if (!days.length) throw new Error('Select at least one available day');
        out.availableDays = days;
    }
    if (body.sortOrder !== undefined) out.sortOrder = num(body.sortOrder, 0);
    if (body.isEnabled !== undefined) out.isEnabled = Boolean(body.isEnabled);

    const s = out.startTime, e = out.endTime;
    if (s && e && s >= e) throw new Error('End time must be later than start time');
    return out;
};

const slugify = (name) => String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 30);

export const createSlot = async (body) => {
    await ensureDefaultSlots();
    const data = sanitize(body);
    const key = String(body.key || slugify(data.name)).toLowerCase();
    if (!KEY_RE.test(key)) throw new Error('Slot key must start with a letter and use only a-z, 0-9 and underscore (2-30 chars)');
    if (await DeliverySlot.exists({ key })) throw new Error(`A slot with key "${key}" already exists`);
    if (data.sortOrder === undefined) data.sortOrder = (await DeliverySlot.countDocuments()) + 1;
    const doc = await DeliverySlot.create({ ...data, key });
    return doc.toObject();
};

export const updateSlot = async (id, body) => {
    const data = sanitize(body, { partial: true });
    const current = await DeliverySlot.findById(id);
    if (!current) throw new Error('Delivery slot not found');
    const start = data.startTime || current.startTime;
    const end = data.endTime || current.endTime;
    if (start >= end) throw new Error('End time must be later than start time');
    Object.assign(current, data);
    await current.save();
    return current.toObject();
};

/** Counts live references so a slot in use is never hard-deleted (disable it instead). */
export const getSlotUsage = async (key) => {
    const [{ DMBSubscription }, { DMBDailyOrder }, { DMBMealPlan }] = await Promise.all([
        import('../subscription/subscription.model.js'),
        import('../subscription/dmb.dailyOrder.model.js'),
        import('../mealplan/mealPlan.model.js')
    ]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [subs, orders, plans] = await Promise.all([
        DMBSubscription.countDocuments({ status: { $in: ['active', 'paused', 'pending_payment'] }, $or: [{ deliverySlot: key }, { deliverySlots: key }] }),
        DMBDailyOrder.countDocuments({ deliverySlot: key, deliveryDate: { $gte: today }, status: { $in: ['scheduled', 'preparing', 'ready', 'out_for_delivery'] } }),
        DMBMealPlan.countDocuments({ status: { $ne: 'archived' }, availableSlots: key })
    ]);
    return { subscriptions: subs, upcomingOrders: orders, mealPlans: plans, total: subs + orders + plans };
};

export const deleteSlot = async (id) => {
    const slot = await DeliverySlot.findById(id);
    if (!slot) throw new Error('Delivery slot not found');
    const usage = await getSlotUsage(slot.key);
    if (usage.total > 0) {
        const err = new Error(`Slot is in use (${usage.subscriptions} subscriptions, ${usage.upcomingOrders} upcoming orders, ${usage.mealPlans} meal plans). Disable it instead of deleting.`);
        err.statusCode = 409;
        err.usage = usage;
        throw err;
    }
    await slot.deleteOne();
    return { deleted: true };
};

/** Keyed map ({ lunch: {startTime,…}, … }) used by legacy timing consumers. */
export const getSlotTimingMap = async () => {
    const slots = await listSlots();
    return Object.fromEntries(slots.map((s) => [s.key, {
        startTime: s.startTime, endTime: s.endTime, maxPrepMinutes: s.maxPrepMinutes, isEnabled: s.isEnabled, name: s.name
    }]));
};

export const getSlotPriorityMap = async () =>
    Object.fromEntries((await listSlots()).map((s, i) => [s.key, i + 1]));

/** True when the slot exists, is enabled, and is offered on the given weekday (0=Sun). */
export const slotServesDay = (slotDefs, key, dayOfWeek) => {
    const def = slotDefs.find((s) => s.key === key);
    if (!def || def.isEnabled === false) return false;
    return def.availableDays.includes(dayOfWeek);
};
