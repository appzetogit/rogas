import mongoose from 'mongoose';
import { DMBSubscription } from './subscription.model.js';
import { DMBDailyOrder } from './dmb.dailyOrder.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { deliveriesOn, cleanWeekdays, deliveryWeekdays } from './schedule.js';
import { vendorServesZone } from './pricing.service.js';
import { assertAddressInZone } from '../zones/zoneGeo.service.js';
import { holidaySetForZone, holidaysInRange } from '../platform/holiday.service.js';
import { getControl, cityIdForZone } from '../platform/platformConfig.service.js';
import { listSlots } from '../deliverySlot/deliverySlot.service.js';
import { addDays, localToday, storageDateStr, zonedInstant, localDateStr, localTimeHHMM } from '../../../utils/platformTime.js';

export class ManageError extends Error {
    constructor(message, statusCode = 400, code = 'INVALID', details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Company-paid meals go to the company's address; only the office can change it (Company Details). */
const OFFICE_ADDRESS_MESSAGE = 'Meals paid by your company are delivered to your company\'s address. Ask your office manager to change it.';

export const findCustomerSubscription = async (userId, id) => {
    const or = [{ subscriptionId: id }];
    if (mongoose.Types.ObjectId.isValid(String(id))) or.push({ _id: id });
    const sub = await DMBSubscription.findOne({ userId, $or: or });
    if (!sub) throw new ManageError('Subscription not found', 404, 'NOT_FOUND');
    return sub;
};

const savedAddress = async (userId, addressId) => {
    const user = await FoodUser.findById(userId).select('addresses').lean();
    const a = (user?.addresses || []).find((x) => String(x._id) === String(addressId));
    if (!a) throw new ManageError('Saved address not found', 404, 'NOT_FOUND');
    await assertAddressInZone(a, { source: 'address_change', userId });
    return {
        label: a.label, customLabel: a.customLabel || '', street: a.street, additionalDetails: a.additionalDetails || '',
        city: a.city, state: a.state, zipCode: a.zipCode || '', phone: a.phone || '', location: a.location,
        addressId: a._id, zoneId: a.zoneId
    };
};

const vendorsOf = async (sub, days) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    let ids = [sub.vendorId];
    if (sub.subscriptionType === 'rotation') {
        ids = (sub.rotation || []).filter((r) => !days || r.days.some((d) => days.includes(d))).map((r) => r.vendorId);
    }
    return FoodRestaurant.find({ _id: { $in: ids } }).select('restaurantName zoneId deliveryZoneIds').lean();
};

/**
 * Gap U/V: change where a subscription delivers — the whole subscription, or only some weekdays.
 * If the maker(s) do not deliver to the new address's zone nothing is saved: the subscription is flagged
 * (zoneMismatch) and the customer is asked to choose a new maker first.
 */
export const changeSubscriptionAddress = async ({ userId, subscriptionId, addressId, days }) => {
    const sub = await findCustomerSubscription(userId, subscriptionId);
    if (sub.source === 'office') throw new ManageError(OFFICE_ADDRESS_MESSAGE, 403, 'OFFICE_MANAGED');
    if (!['active', 'paused', 'pending_payment'].includes(sub.status)) throw new ManageError('This subscription can no longer be changed');
    const address = await savedAddress(userId, addressId);
    const onlyDays = Array.isArray(days) && days.length ? cleanWeekdays(days).filter((d) => deliveryWeekdays(sub).includes(d)) : null;
    const vendors = await vendorsOf(sub, onlyDays);
    const bad = vendors.filter((v) => !vendorServesZone(v, address.zoneId));
    if (bad.length) {
        sub.zoneMismatch = { detected: true, at: new Date(), newZoneId: address.zoneId };
        await sub.save();
        throw new ManageError(`${bad[0].restaurantName} doesn't deliver here. Choose a new maker?`, 409, 'SUBSCRIPTION_ZONE_MISMATCH', {
            vendors: bad.map((v) => ({ _id: v._id, name: v.restaurantName })), newZoneId: address.zoneId
        });
    }
    if (onlyDays) {
        const perDay = (sub.dayAddresses || []).filter((d) => !onlyDays.includes(Number(d.day)));
        for (const day of onlyDays) perDay.push({ day, addressId: address.addressId, address });
        sub.dayAddresses = perDay;
    } else {
        sub.deliveryAddress = address;
        sub.dayAddresses = undefined;
        sub.zoneId = address.zoneId;
    }
    sub.zoneMismatch = { detected: false, at: null, newZoneId: null };
    await sub.save();

    // Not-yet-prepared deliveries follow the new address (one-off overrides stay as they are).
    const future = await DMBDailyOrder.find({ subscriptionId: sub._id, deliveryDate: { $gte: addDays(localToday(), 1) }, status: 'scheduled', addressOverridden: { $ne: true } });
    for (const order of future) {
        const dow = new Date(order.deliveryDate).getUTCDay();
        if (onlyDays && !onlyDays.includes(dow)) continue;
        order.deliveryAddress = address;
        await order.save();
    }
    return sub.toObject();
};

/** Same cut-off rules as skip/change meal: not today, not after the slot's cut-off. */
const assertOrderEditable = async (order) => {
    const dateStr = storageDateStr(order.deliveryDate);
    if (dateStr <= localDateStr()) throw new ManageError("Today's and past deliveries can't be changed");
    const slot = (await listSlots()).find((s) => s.key === order.deliverySlot);
    if (slot?.orderCutoffHours > 0 && Date.now() >= zonedInstant(dateStr, slot.startTime).getTime() - slot.orderCutoffHours * 3600_000) {
        throw new ManageError(`Changes to ${slot.name} deliveries close ${slot.orderCutoffHours} hour(s) before the slot`);
    }
    if (dateStr === storageDateStr(addDays(localToday(), 1))) {
        const { VendorTimingSettings } = await import('../../food/admin/models/vendorTimingSettings.model.js');
        const cutoff = (await VendorTimingSettings.findOne({ isActive: true }).lean())?.mealChangeCutoffTime || '20:00';
        if (localTimeHHMM() >= cutoff) throw new ManageError(`Tomorrow's delivery can't be changed after ${cutoff}`);
    }
    if (order.status !== 'scheduled') throw new ManageError('This delivery is already being prepared');
};

/** Gap V: deliver one specific day somewhere else, without touching the weekly assignment. */
export const overrideOrderAddress = async ({ userId, orderId, addressId }) => {
    const order = await DMBDailyOrder.findOne({ _id: orderId, userId });
    if (!order) throw new ManageError('Delivery not found', 404, 'NOT_FOUND');
    if (order.subscriptionId && await DMBSubscription.exists({ _id: order.subscriptionId, source: 'office' })) {
        throw new ManageError(OFFICE_ADDRESS_MESSAGE, 403, 'OFFICE_MANAGED');
    }
    await assertOrderEditable(order);
    const address = await savedAddress(userId, addressId);
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const vendor = await FoodRestaurant.findById(order.vendorId).select('restaurantName zoneId deliveryZoneIds').lean();
    if (!vendorServesZone(vendor, address.zoneId)) {
        throw new ManageError(`${vendor?.restaurantName || 'Your maker'} doesn't deliver to that address`, 409, 'SUBSCRIPTION_ZONE_MISMATCH');
    }
    order.deliveryAddress = address;
    order.addressOverridden = true;
    await order.save();
    return order.toObject();
};

/**
 * Gap AE: the next N delivery days (ACM-171, default 10) with each day's meals, maker, lock state and holidays.
 * Days without an uploaded menu say "menu coming soon". Rotation days carry the maker's colour.
 */
export const upcomingDeliveries = async ({ userId, subscriptionId, days }) => {
    const subs = subscriptionId
        ? [await findCustomerSubscription(userId, subscriptionId)]
        : await DMBSubscription.find({ userId, status: { $in: ['active', 'paused'] } });
    const cfg = await getControl('calendarPreviewDays');
    const span = Math.max(2, Math.min(Number(days) || Number(cfg.days) || 10, 14));
    const today = localToday();
    const slotDefs = await listSlots();
    const slotByKey = new Map(slotDefs.map((s) => [s.key, s]));
    const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const { VendorTimingSettings } = await import('../../food/admin/models/vendorTimingSettings.model.js');
    const cutoff = (await VendorTimingSettings.findOne({ isActive: true }).lean())?.mealChangeCutoffTime || '20:00';
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'];
    const out = [];

    for (const sub of subs) {
        const s = sub.toObject ? sub.toObject() : sub;
        const holidays = await holidaySetForZone(s.zoneId);
        const holidayList = await holidaysInRange({ cityId: await cityIdForZone(s.zoneId), from: today, to: addDays(today, span) });
        const orders = await DMBDailyOrder.find({ subscriptionId: s._id, deliveryDate: { $gte: today, $lt: addDays(today, span) } }).lean();
        const orderKey = new Map(orders.map((o) => [`${storageDateStr(o.deliveryDate)}|${o.deliverySlot}`, o]));
        const vendorIds = [...new Set([String(s.vendorId), ...((s.rotation || []).map((r) => String(r.vendorId)))])];
        const vendors = new Map((await FoodRestaurant.find({ _id: { $in: vendorIds } }).select('restaurantName profileImage').lean()).map((v) => [String(v._id), v]));
        const rotationColor = new Map((s.rotation || []).map((r, i) => [String(r.vendorId), colors[i % colors.length]]));
        const daysOut = [];
        for (let i = 0; i < span; i++) {
            const date = addDays(today, i);
            const key = storageDateStr(date);
            const holiday = holidayList.find((h) => h.date === key);
            const planned = s.status === 'active' ? deliveriesOn(s, date, { slotDefs, holidays: null }) : [];
            if (!planned.length && !holiday) continue;
            const slots = [];
            for (const dv of holiday ? [] : planned) {
                const order = orderKey.get(`${key}|${dv.slot}`);
                const menus = await DMBDailyMenu.find({ vendorId: dv.vendorId, date, slot: dv.slot }).select('dishName mealPlanId photo').lean();
                const meals = [];
                for (const m of order?.meals?.length ? order.meals : dv.meals) {
                    const menu = menus.find((x) => String(x.mealPlanId) === String(m.mealPlanId)) || menus[0];
                    const plan = menu ? null : await DMBMealPlan.findById(m.mealPlanId).select('name').lean();
                    meals.push({
                        mealPlanId: m.mealPlanId, memberLabel: m.memberLabel || '',
                        name: menu?.dishName || (m.name && m.name !== 'No meal set' ? m.name : '') || plan?.name || '',
                        menuConfirmed: Boolean(menu), photo: menu?.photo || '', temperatureType: m.temperatureType || null
                    });
                }
                const slotDef = slotByKey.get(dv.slot);
                const isTomorrow = key === storageDateStr(addDays(today, 1));
                const slotCutoffPassed = slotDef?.orderCutoffHours > 0 && Date.now() >= zonedInstant(key, slotDef.startTime).getTime() - slotDef.orderCutoffHours * 3600_000;
                const locked = i === 0 || slotCutoffPassed || (isTomorrow && localTimeHHMM() >= cutoff) || (order && order.status !== 'scheduled' && order.status !== 'skipped');
                const vendor = vendors.get(String(dv.vendorId));
                slots.push({
                    slot: dv.slot, slotName: slotDef?.name || dv.slot, slotIcon: slotDef?.icon || '',
                    orderId: order?._id || null, status: order?.status || 'planned',
                    vendorId: dv.vendorId, vendorName: vendor?.restaurantName || '',
                    vendorColor: s.subscriptionType === 'rotation' ? rotationColor.get(String(dv.vendorId)) : null,
                    meals, menuStatus: meals.length && meals.every((m) => m.menuConfirmed) ? 'confirmed' : 'pending',
                    locked: Boolean(locked), address: order?.deliveryAddress || dv.address, addressOverridden: Boolean(order?.addressOverridden)
                });
            }
            daysOut.push({ date: key, weekday: DAY_NAMES[date.getUTCDay()], isToday: i === 0, holiday: holiday ? { name: holiday.name, icon: holiday.icon } : null, slots });
        }
        out.push({
            subscriptionId: s.subscriptionId, _id: s._id, status: s.status, subscriptionType: s.subscriptionType || 'dedicated',
            deliveryPattern: s.deliveryPattern, startDate: s.startDate, endDate: s.endDate, days: daysOut
        });
    }
    return { previewDays: span, subscriptions: out };
};

/**
 * Gap AK: edit a rotation. Takes effect from the next billing cycle (the current period was paid for as it was);
 * the new schedule is stored and applied to the replacement period. Validation is the same as at checkout.
 */
export const updateRotation = async ({ userId, subscriptionId, rotation }) => {
    const sub = await findCustomerSubscription(userId, subscriptionId);
    if (sub.subscriptionType !== 'rotation') throw new ManageError('This subscription is not a Smart Rotation');
    const { quoteSubscription } = await import('./pricing.service.js');
    // Validate by quoting the next period with the new rotation.
    const nextStart = sub.endDate && new Date(sub.endDate) > localToday() ? sub.endDate : addDays(localToday(), 1);
    const quote = await quoteSubscription({
        subscriptionPlanId: String(sub.subscriptionPlanId), zoneId: String(sub.zoneId), subscriptionType: 'rotation',
        deliveryDays: 'custom', deliveryDaysList: deliveryWeekdays(sub), deliverySlots: sub.deliverySlots, daySlots: sub.daySlots,
        rotation, startDate: storageDateStr(nextStart), replacesSubscriptionId: String(sub._id)
    }, { userId });
    sub.pendingRotation = quote.rotation.map(({ vendorId, mealPlanId, quantity, days, pricePerDay }) => ({ vendorId, mealPlanId, quantity, days, pricePerDay }));
    sub.pendingRotationFrom = new Date(quote.startDate);
    sub.markModified('pendingRotation');
    await sub.save();
    return { effectiveFrom: quote.startDate, nextPeriodTotal: quote.totals.total, currency: quote.currency, rotation: quote.rotation };
};
