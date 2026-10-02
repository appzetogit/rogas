import { notifyMany } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';
import { zoneIdsForCity } from './platformConfig.service.js';
import { storageDateStr, addDays } from '../../../utils/platformTime.js';
import { deliveriesOn } from '../subscription/schedule.js';

/**
 * Holiday announcements (Gap G): 7 days before → customers (push + email), vendors (push + email), drivers (push);
 * 3 days before → customers (push reminder).
 */
export const notifyHoliday = async (holiday, { kind }) => {
    const [{ DMBSubscription }, { FoodRestaurant }, { FoodDeliveryPartner }, slotSvc] = await Promise.all([
        import('../subscription/subscription.model.js'),
        import('../../food/restaurant/models/restaurant.model.js'),
        import('../../food/delivery/models/deliveryPartner.model.js'),
        import('../deliverySlot/deliverySlot.service.js')
    ]);
    const date = storageDateStr(holiday.date);
    const zoneIds = holiday.scope === 'city' ? await zoneIdsForCity(holiday.cityId) : null;

    const subFilter = { status: { $in: ['active', 'paused'] } };
    if (zoneIds) subFilter.zoneId = { $in: zoneIds };
    const subs = await DMBSubscription.find(subFilter).lean();
    const slotDefs = await slotSvc.listSlots();

    // "Next delivery" for each customer: their first delivery after the holiday.
    const nextDeliveryFor = (sub) => {
        for (let i = 1; i <= 14; i++) {
            const d = addDays(holiday.date, i);
            if (deliveriesOn(sub, d, { slotDefs }).length) return storageDateStr(d);
        }
        return '';
    };
    const customers = new Map();
    for (const sub of subs) {
        if (!customers.has(String(sub.userId))) customers.set(String(sub.userId), nextDeliveryFor(sub));
    }

    const vars = { date, name: holiday.name };
    for (const [userId, next] of customers) {
        await notifyMany([{ id: userId }], {
            to: 'customer',
            event: 'platform_holiday',
            title: kind === 'week' ? msg('No delivery on {{date}}', vars) : msg('Reminder: no delivery on {{date}}', vars),
            body: next
                ? msg('No DailyMealBox delivery on {{date}} ({{name}}). Next delivery: {{next}}.', { ...vars, next })
                : msg('No DailyMealBox delivery on {{date}} ({{name}}).', vars),
            link: '/user/calendar',
            data: { date },
            email: kind === 'week' ? {
                subjectKey: 'No delivery on {{date}}',
                bodyKey: 'No DailyMealBox delivery on {{date}} ({{name}}). Your subscription has been extended by one delivery day, so you do not lose a paid meal.',
                vars
            } : null
        });
    }

    if (kind !== 'week') return { customers: customers.size };

    const vendorIds = [...new Set(subs.flatMap((s) => [String(s.vendorId), ...(s.rotation || []).map((r) => String(r.vendorId))]))];
    const vendorFilter = zoneIds ? { $or: [{ _id: { $in: vendorIds } }, { zoneId: { $in: zoneIds } }] } : { status: 'approved' };
    const vendors = await FoodRestaurant.find(vendorFilter).select('_id').lean();
    await notifyMany(vendors.map((v) => ({ id: v._id })), {
        to: 'vendor',
        event: 'platform_holiday',
        title: msg('Platform closed on {{date}}', vars),
        body: msg('Platform closed {{date}} ({{name}}). No orders will be placed.', vars),
        data: { date },
        email: { subjectKey: 'Platform closed on {{date}}', bodyKey: 'DailyMealBox is closed on {{date}} ({{name}}). No orders will be placed for that day.', vars }
    });

    const driverFilter = { status: 'approved' };
    if (zoneIds) driverFilter.zoneIds = { $in: zoneIds };
    const drivers = await FoodDeliveryPartner.find(driverFilter).select('_id').lean();
    await notifyMany(drivers.map((d) => ({ id: d._id })), {
        to: 'driver',
        event: 'platform_holiday',
        title: msg('Platform holiday on {{date}}', vars),
        body: msg('No shifts on {{date}} ({{name}}) — the platform is closed.', vars),
        data: { date }
    });
    return { customers: customers.size, vendors: vendors.length, drivers: drivers.length };
};
