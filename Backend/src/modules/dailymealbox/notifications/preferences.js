/**
 * Customer notification preferences (Gap W).
 *
 * Four categories, each with independent sub-toggles. Critical types (order delivered, payment failed, subscription
 * cancelled) can never be switched off — the apps show them with a lock. Admins can additionally force any type to be
 * delivered regardless of the customer's choice (control `forcedNotifications`), e.g. an emergency maintenance notice.
 *
 * Every push carries `data.event`; EVENT_TYPES maps it to its preference type. An event that is not listed is
 * transactional and always delivered.
 */

export const NOTIFICATION_CATEGORIES = {
    delivery_updates: {
        label: 'Delivery updates',
        types: {
            driver_assigned: { label: 'Driver assigned', default: true },
            arriving: { label: 'Driver arriving', default: true },
            order_delivered: { label: 'Order delivered', default: true, locked: true },
            delivery_failed: { label: 'Delivery problem', default: true, locked: true }
        }
    },
    subscription: {
        label: 'Subscription',
        types: {
            tomorrow_preview: { label: "Tomorrow's meal preview", default: true },
            menu_confirmed: { label: 'Menu confirmed for an upcoming day', default: true },
            platform_closure: { label: 'Platform holidays & closures', default: true },
            renewal_reminder: { label: 'Renewal reminders', default: true },
            review_response: { label: 'A vendor replied to my review', default: true },
            payment_failed: { label: 'Payment failed', default: true, locked: true },
            subscription_cancelled: { label: 'Subscription cancelled', default: true, locked: true },
            slot_change_required: { label: 'Delivery slot discontinued', default: true, locked: true }
        }
    },
    pantry: {
        label: 'Pantry Box',
        types: {
            window_open: { label: 'Pantry ordering window open', default: false },
            pantry_order_updates: { label: 'Pantry order updates', default: true }
        }
    },
    promotions: {
        label: 'Promotions',
        types: {
            flash_deals: { label: 'Flash deals', default: false },
            new_vendors: { label: 'New makers near me', default: false },
            subscribe_offers: { label: 'Subscription offers', default: false },
            preorder_launches: { label: 'New meal launches & pre-orders', default: true }
        }
    }
};

/** Push event (data.event) → preference type. */
export const EVENT_TYPES = {
    driver_assigned: 'driver_assigned',
    driver_arriving: 'arriving',
    arriving_soon: 'arriving',
    order_delivered: 'order_delivered',
    delivered: 'order_delivered',
    delivery_failed: 'delivery_failed',
    tomorrow_preview: 'tomorrow_preview',
    menu_confirmed: 'menu_confirmed',
    platform_holiday: 'platform_closure',
    renewal_reminder: 'renewal_reminder',
    subscription_expiring: 'renewal_reminder',
    review_response: 'review_response',
    payment_failed: 'payment_failed',
    subscription_cancelled: 'subscription_cancelled',
    slot_discontinued: 'slot_change_required',
    pantry_window_open: 'window_open',
    pantry_order_update: 'pantry_order_updates',
    flash_deal: 'flash_deals',
    promotion: 'flash_deals',
    new_vendor: 'new_vendors',
    subscribe_offer: 'subscribe_offers',
    preorder_launch: 'preorder_launches'
};

const typeIndex = () => {
    const out = {};
    for (const [category, def] of Object.entries(NOTIFICATION_CATEGORIES)) {
        for (const [type, t] of Object.entries(def.types)) out[type] = { category, ...t };
    }
    return out;
};
export const TYPE_INDEX = typeIndex();
export const ALL_TYPES = Object.keys(TYPE_INDEX);

export const defaultPreferences = () => {
    const out = {};
    for (const [category, def] of Object.entries(NOTIFICATION_CATEGORIES)) {
        out[category] = Object.fromEntries(Object.entries(def.types).map(([type, t]) => [type, t.default]));
    }
    return out;
};

/** Stored prefs merged over the defaults; locked types are always true. */
export const effectivePreferences = (stored) => {
    const base = defaultPreferences();
    for (const [category, def] of Object.entries(NOTIFICATION_CATEGORIES)) {
        for (const type of Object.keys(def.types)) {
            const v = stored?.[category]?.[type];
            if (typeof v === 'boolean') base[category][type] = v;
            if (def.types[type].locked) base[category][type] = true;
        }
    }
    return base;
};

/** Cleans a client update (unknown keys dropped, locked types refused silently as true). */
export const cleanPreferenceUpdate = (stored, update) => {
    const next = effectivePreferences(stored);
    for (const [category, types] of Object.entries(update || {})) {
        if (!NOTIFICATION_CATEGORIES[category] || typeof types !== 'object') continue;
        for (const [type, value] of Object.entries(types)) {
            const def = NOTIFICATION_CATEGORIES[category].types[type];
            if (!def || def.locked) continue;
            next[category][type] = Boolean(value);
        }
    }
    return next;
};

/** Whether a push with this event should reach a customer with these stored preferences. */
export const allowsEvent = (stored, event, forcedTypes = []) => {
    const type = EVENT_TYPES[event] || (TYPE_INDEX[event] ? event : null);
    if (!type) return true; // transactional / unknown → always delivered
    if (forcedTypes.includes(type)) return true;
    const def = TYPE_INDEX[type];
    if (def.locked) return true;
    return effectivePreferences(stored)[def.category][type] !== false;
};

/** Catalogue for the apps (labels are English source strings, translated client-side). */
export const preferenceCatalogue = () =>
    Object.entries(NOTIFICATION_CATEGORIES).map(([category, def]) => ({
        category,
        label: def.label,
        types: Object.entries(def.types).map(([type, t]) => ({ type, label: t.label, locked: Boolean(t.locked) }))
    }));
