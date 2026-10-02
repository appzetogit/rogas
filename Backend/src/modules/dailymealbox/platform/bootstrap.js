import mongoose from 'mongoose';
import { DMBPlatformControl } from './platform.models.js';
import { invalidatePlatformConfig } from './platformConfig.service.js';
import { logger } from '../../../utils/logger.js';

/**
 * One-time, idempotent upgrades for databases that existed before Amendment v2 Extra. Runs at startup; every step is
 * safe to repeat and failures are logged without stopping the server.
 */

const step = async (name, fn) => {
    try {
        const res = await fn();
        if (res) logger.info(`[bootstrap] ${name}: ${typeof res === 'string' ? res : JSON.stringify(res)}`);
    } catch (err) {
        logger.warn(`[bootstrap] ${name} failed: ${err.message}`);
    }
};

const indexes = async (collection) => {
    try {
        return await mongoose.connection.db.collection(collection).indexes();
    } catch {
        return [];
    }
};

/** Keeps today's behaviour for existing deployments where the SOP default would switch something off. */
const preserveBehaviour = async () => {
    const out = {};
    const [{ VendorSubscriptionPlan }, { DMBSubscription }, { DeliverySlot }] = await Promise.all([
        import('../subscription/vendorSubscriptionPlan.model.js'),
        import('../subscription/subscription.model.js'),
        import('../deliverySlot/deliverySlot.model.js')
    ]);

    // ACM-177 defaults to "no weekends", but this platform already sells full-week plans → keep weekends open.
    if (!(await DMBPlatformControl.exists({ key: 'weekendDelivery', cityId: null }))) {
        const fullWeek = await VendorSubscriptionPlan.exists({ deliveryDays: 'full_week', status: 'active' })
            || await DMBSubscription.exists({ deliveryDays: 'full_week', status: { $in: ['active', 'paused'] } });
        const weekendSlots = await DeliverySlot.exists({ availableDays: { $in: [0, 6] }, isEnabled: true });
        if (fullWeek && weekendSlots) {
            await DMBPlatformControl.create({ key: 'weekendDelivery', cityId: null, value: { saturday: true, sunday: true }, updatedByEmail: 'system-migration' });
            out.weekendDelivery = 'kept open (existing full-week plans)';
        }
    }

    // ACM-148 defaults to 1 slot/day; existing customers already hold several → start from what is in use.
    if (!(await DMBPlatformControl.exists({ key: 'maxSlotsPerDay', cityId: null }))) {
        const [row] = await DMBSubscription.aggregate([
            { $match: { status: { $in: ['active', 'paused'] }, 'deliverySlots.1': { $exists: true } } },
            { $project: { n: { $size: '$deliverySlots' } } },
            { $group: { _id: null, max: { $max: '$n' } } }
        ]);
        const slotsCount = await DeliverySlot.countDocuments({ isEnabled: true });
        if (row?.max > 1) {
            const value = Math.min(6, Math.max(row.max, slotsCount));
            await DMBPlatformControl.create({ key: 'maxSlotsPerDay', cityId: null, value: { value }, updatedByEmail: 'system-migration' });
            out.maxSlotsPerDay = value;
        }
    }
    invalidatePlatformConfig();
    return Object.keys(out).length ? out : null;
};

export const runAmendmentBootstrap = async () => {
    const db = mongoose.connection.db;
    if (!db) return;

    // Inbox notifications: the old "sparse" unique index allowed one non-broadcast notification per person.
    await step('food_notifications index', async () => {
        const idx = (await indexes('food_notifications')).find((i) => i.name === 'broadcastId_1_ownerType_1_ownerId_1');
        if (idx && idx.unique && !idx.partialFilterExpression) {
            await db.collection('food_notifications').dropIndex(idx.name);
            await db.collection('food_notifications').createIndex({ broadcastId: 1, ownerType: 1, ownerId: 1 }, { unique: true, partialFilterExpression: { broadcastId: { $type: 'objectId' } } });
            return 'replaced with a partial index';
        }
        return null;
    });

    // Daily orders: one row per subscription/day/slot, but Select-mode and pre-order rows have no subscription.
    await step('dmb_daily_orders index', async () => {
        const idx = (await indexes('dmb_daily_orders')).find((i) => i.name === 'subscriptionId_1_deliveryDate_1_deliverySlot_1');
        if (idx) {
            await db.collection('dmb_daily_orders').dropIndex(idx.name);
            const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
            await DMBDailyOrder.syncIndexes();
            return 'replaced with a partial index';
        }
        return null;
    });

    await step('controls', preserveBehaviour);

    // Vendors: weekday capability (Gap AJ) — existing vendors keep delivering on the days they did.
    await step('vendor delivery weekdays', async () => {
        const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
        const { getControl } = await import('./platformConfig.service.js');
        const weekend = await getControl('weekendDelivery');
        const days = [1, 2, 3, 4, 5, ...(weekend.saturday ? [6] : []), ...(weekend.sunday ? [0] : [])];
        const res = await FoodRestaurant.updateMany({ deliveryWeekdays: { $exists: false } }, { $set: { deliveryWeekdays: days } });
        return res.modifiedCount ? `${res.modifiedCount} vendors set to ${days.join(',')}` : null;
    });

    // Delivery slots: lifecycle fields (Gap A).
    await step('delivery slot lifecycle', async () => {
        const { listSlots } = await import('../deliverySlot/deliverySlot.service.js');
        await listSlots();
        return null;
    });

    // Subscriptions: billing cycle + query helpers for rows created before the new checkout.
    await step('subscription fields', async () => {
        const { DMBSubscription } = await import('../subscription/subscription.model.js');
        const res = await DMBSubscription.updateMany({ billingCycle: { $exists: false }, duration: { $in: ['one_day', 'weekly', 'monthly'] } }, [{ $set: { billingCycle: '$duration' } }]);
        const res2 = await DMBSubscription.updateMany({ vendorIds: { $exists: false } }, [{ $set: { vendorIds: ['$vendorId'] } }]);
        return res.modifiedCount || res2.modifiedCount ? { billingCycle: res.modifiedCount, vendorIds: res2.modifiedCount } : null;
    });

    // Field-level encryption (Gap N): values stored before encryption was switched on are encrypted in place.
    await step('field encryption', async () => {
        const { encryptExistingValues } = await import('../../../utils/encryptedFields.plugin.js');
        const { ENCRYPTED_FIELDS } = await import('./security.js');
        await Promise.all([
            import('../../../core/users/user.model.js'),
            import('../../food/delivery/models/deliveryPartner.model.js'),
            import('../../food/restaurant/models/restaurant.model.js'),
            import('../vendor/fleetPartner.model.js'),
            import('../../../models/KitchenPartner.js'),
            import('../integrations/whatsapp.service.js')
        ]);
        const out = {};
        for (const entry of ENCRYPTED_FIELDS) {
            const { updated } = await encryptExistingValues(mongoose.model(entry.model), entry.paths);
            if (updated) out[entry.model] = updated;
        }
        return Object.keys(out).length ? out : null;
    });
};
