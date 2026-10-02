import mongoose from 'mongoose';
import { logger } from '../../../utils/logger.js';
import { allowsEvent } from './preferences.js';

/**
 * One call to reach a customer, vendor or driver through every channel the SOP asks for ("FCM + email"):
 *   - web push (Firebase Messaging) — localized by the push layer, filtered by customer preferences (Gap W)
 *   - an in-app inbox entry (the web apps cannot rely on push permission being granted)
 *   - optionally an email (transactional, or marketing only with consent)
 * Never throws: a notification failure must not undo the business action that triggered it.
 */

const OWNER = { customer: 'USER', user: 'USER', vendor: 'RESTAURANT', restaurant: 'RESTAURANT', driver: 'DELIVERY_PARTNER', delivery_partner: 'DELIVERY_PARTNER' };

const MODEL_IMPORTS = {
    USER: () => import('../../../core/users/user.model.js').then((m) => ({ model: m.FoodUser, emailField: 'email' })),
    RESTAURANT: () => import('../../food/restaurant/models/restaurant.model.js').then((m) => ({ model: m.FoodRestaurant, emailField: 'ownerEmail' })),
    DELIVERY_PARTNER: () => import('../../food/delivery/models/deliveryPartner.model.js').then((m) => ({ model: m.FoodDeliveryPartner, emailField: 'email' }))
};

let forcedCache = { at: 0, types: [] };
const forcedTypes = async () => {
    if (Date.now() - forcedCache.at < 30_000) return forcedCache.types;
    try {
        const { getControl } = await import('../platform/platformConfig.service.js');
        forcedCache = { at: Date.now(), types: (await getControl('forcedNotifications')).types || [] };
    } catch {
        forcedCache = { at: Date.now(), types: [] };
    }
    return forcedCache.types;
};

/** Used by the push layer for every customer push. */
export const customerAllowsPush = async (userId, event) => {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) return true;
    const { FoodUser } = await import('../../../core/users/user.model.js');
    const user = await FoodUser.findById(userId).select('notificationPreferences').lean();
    return allowsEvent(user?.notificationPreferences, event, await forcedTypes());
};

const textOf = async (ownerType, ownerId, value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value.__i18n) {
        try {
            // Aliased: the catalog extractor only accepts literal keys at translateFor() call sites.
            const { translateFor: translateText } = await import('../../i18n/i18n.service.js');
            return await translateText(ownerType, ownerId, value.key, value.vars || {}, value.namespace || 'notifications');
        } catch {
            return String(value.key || '');
        }
    }
    return String(value);
};

/**
 * notify({ to: 'customer'|'vendor'|'driver', id, event, title, body, link, data,
 *          email: { subjectKey, bodyKey, vars } | null, marketing: false, inbox: true })
 * `title` / `body` may be msg('...') objects (translated per recipient) or plain strings.
 */
export const notify = async ({ to, id, event, title, body, link = '', data = {}, email = null, marketing = false, inbox = true }) => {
    const ownerType = OWNER[String(to || '').toLowerCase()];
    if (!ownerType || !id) return { ok: false };
    const result = { push: null, inbox: false, email: false };

    if (ownerType === 'USER' && event && !(await customerAllowsPush(id, event))) {
        return { ...result, skipped: 'preference' };
    }

    try {
        const { sendNotificationToOwner } = await import('../../../core/notifications/firebase.service.js');
        result.push = await sendNotificationToOwner({ ownerType, ownerId: id, payload: { title, body, data: { ...data, event: event || data.event || '', link } } });
    } catch (err) {
        logger.warn(`[notify] push to ${ownerType}:${id} failed: ${err.message}`);
    }

    if (inbox) {
        try {
            const { FoodNotification } = await import('../../../core/notifications/models/notification.model.js');
            await FoodNotification.create({
                ownerType, ownerId: id,
                title: (await textOf(ownerType, id, title)) || 'Notification',
                message: (await textOf(ownerType, id, body)) || ' ',
                link, category: event || 'system', source: 'SYSTEM', metadata: data
            });
            result.inbox = true;
        } catch (err) {
            logger.warn(`[notify] inbox for ${ownerType}:${id} failed: ${err.message}`);
        }
    }

    if (email?.subjectKey && email?.bodyKey) {
        try {
            const { model, emailField } = await MODEL_IMPORTS[ownerType]();
            const select = ownerType === 'USER' ? `${emailField} marketingEmailConsent` : emailField;
            const doc = await model.findById(id).select(select).lean();
            const address = doc?.[emailField];
            const consentOk = !marketing || doc?.marketingEmailConsent?.granted === true;
            if (address && consentOk) {
                // Aliased for the same reason; the literal keys are picked up from the caller's `email: { subjectKey, bodyKey }`.
                const { queueEmail: sendEmail } = await import('../../email/email.service.js');
                await sendEmail({ to: address, subjectKey: email.subjectKey, bodyKey: email.bodyKey, vars: email.vars || {}, ownerType, ownerId: id, attachments: email.attachments || [] });
                result.email = true;
            }
        } catch (err) {
            logger.warn(`[notify] email to ${ownerType}:${id} failed: ${err.message}`);
        }
    }
    return result;
};

/** Notifies many recipients with the same message, sequentially (keeps provider rate limits happy). */
export const notifyMany = async (recipients, message) => {
    let sent = 0;
    for (const r of recipients) {
        const res = await notify({ ...message, to: r.to || message.to, id: r.id });
        if (res?.push || res?.inbox || res?.email) sent++;
    }
    return { sent };
};
