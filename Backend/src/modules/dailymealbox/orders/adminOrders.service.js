import mongoose from 'mongoose';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { DMBSubscription } from '../subscription/subscription.model.js';
import { DeliverySlot } from '../deliverySlot/deliverySlot.model.js';
import { shiftKeyOf } from '../delivery/driverAssignment.service.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { FoodZone } from '../../food/admin/models/zone.model.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { PantryOrder } from '../../food/restaurant/models/pantryOrder.model.js';
import { localToday, storageDateStr, addDays } from '../../../utils/platformTime.js';

/**
 * Admin "Today's Orders": every delivery of one day in one list — subscription meals, single paid meals, pre-orders and
 * pantry bags — with the customer, kitchen, driver and payment, so an admin can see and fix the day at a glance.
 * Re-assigning a driver reuses the existing planner (POST /assignments/move); this file only reads.
 */

const TYPE_LABEL = { subscription: 'Subscription', one_time_select: 'Single meal', pre_order: 'Pre-order', pantry: 'Pantry' };
/** Same set the planner accepts for a move: after pickup the delivery is with the driver. */
const MOVABLE = ['scheduled', 'preparing', 'ready'];

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(String(v)) ? String(v) : null);
const dayStart = (dateStr) => new Date(`${dateStr}T00:00:00.000Z`);

export const parseDay = (input) => {
    const s = String(input || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(dayStart(s).getTime()) ? s : storageDateStr(localToday());
};

/** Shift key of every slot, so the UI can ask the planner for "who can take this" with the right cell. */
const shiftKeys = async () => {
    const slots = await DeliverySlot.find({}).select('key linkedShiftKey').lean();
    return new Map(slots.map((s) => [s.key, shiftKeyOf(s)]));
};

const mealsText = (meals = []) => meals.map((m) => `${m.name || 'Meal'}${m.quantity > 1 ? ` × ${m.quantity}` : ''}`).join(', ');

const paymentOf = (o) => {
    if (o.orderType === 'subscription' || !o.orderType) return { label: 'Subscription', tone: 'blue' };
    const map = { paid: ['Paid', 'green'], pending: ['Payment pending', 'amber'], failed: ['Payment failed', 'red'], refunded: ['Refunded', 'gray'], not_required: ['—', 'gray'] };
    const [label, tone] = map[o.paymentStatus] || ['—', 'gray'];
    return { label, tone };
};

export const ordersForDay = async ({ date, type = '', slot = '', status = '', q = '', allowedZoneIds = null } = {}) => {
    const dateStr = parseDay(date);
    const day = dayStart(dateStr);
    const next = addDays(day, 1);
    const keyOf = await shiftKeys();

    const [meals, pantry] = await Promise.all([
        DMBDailyOrder.find({ deliveryDate: day })
            .populate('userId', 'name phone')
            .populate('vendorId', 'restaurantName')
            .populate('zoneId', 'name zoneName')
            .populate('dispatch.deliveryPartnerId', 'name phone')
            .sort({ deliverySlot: 1, createdAt: 1 })
            .lean(),
        PantryOrder.find({ status: 'paid', 'dailyDeliveries.date': { $gte: day, $lt: next } })
            .populate('userId', 'name phone')
            .populate('vendorId', 'restaurantName zoneId')
            .lean()
    ]);

    const rows = [];
    for (const o of meals) {
        const zoneId = o.zoneId?._id || null;
        const driver = o.dispatch?.deliveryPartnerId;
        rows.push({
            kind: 'meal', id: String(o._id), orderId: o.orderId, type: o.orderType || 'subscription',
            typeLabel: TYPE_LABEL[o.orderType || 'subscription'] || 'Order',
            status: o.status, slot: o.deliverySlot, slotKey: keyOf.get(o.deliverySlot) || o.deliverySlot, date: dateStr,
            customer: { name: o.userId?.name || o.anonymisedAs || '—', phone: o.userId?.phone || '' },
            vendor: o.vendorId?.restaurantName || '—',
            zoneId: zoneId ? String(zoneId) : null, zone: o.zoneId?.name || o.zoneId?.zoneName || '',
            driver: driver ? { id: String(driver._id), name: driver.name || '—', phone: driver.phone || '' } : null,
            amount: o.pricing?.totalPrice ?? 0, currency: o.pricing?.currency || 'PLN', payment: paymentOf(o),
            items: mealsText(o.meals), bundleId: o.bundleId || '',
            canReassign: MOVABLE.includes(o.status) && Boolean(zoneId)
        });
    }
    for (const po of pantry) {
        const zoneId = po.zoneId || po.vendorId?.zoneId || null;
        for (const dd of po.dailyDeliveries) {
            if (dd.date < day || dd.date >= next) continue;
            rows.push({
                kind: 'pantry', id: String(dd._id), orderId: po.orderId, type: 'pantry', typeLabel: TYPE_LABEL.pantry,
                status: dd.status, slot: dd.slot, slotKey: keyOf.get(dd.slot) || dd.slot, date: dateStr,
                customer: { name: po.userId?.name || '—', phone: po.userId?.phone || '' },
                vendor: po.vendorId?.restaurantName || '—',
                zoneId: zoneId ? String(zoneId) : null, zone: '',
                driver: dd.driverId ? { id: String(dd.driverId), name: '', phone: '' } : null,
                amount: po.pricing?.total ?? 0, currency: 'PLN', amountNote: 'whole pantry order', payment: { label: 'Paid', tone: 'green' },
                items: (po.items || []).map((i) => `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(', '), bundleId: dd.bundleId || '',
                canReassign: MOVABLE.includes(dd.status) && Boolean(zoneId)
            });
        }
    }

    // Pantry deliveries and zones are stored by id only: name them in one lookup each.
    const driverIds = [...new Set(rows.filter((r) => r.driver && !r.driver.name).map((r) => r.driver.id))];
    if (driverIds.length) {
        const found = await FoodDeliveryPartner.find({ _id: { $in: driverIds } }).select('name phone').lean();
        const byId = new Map(found.map((d) => [String(d._id), d]));
        for (const r of rows) if (r.driver && !r.driver.name) r.driver = { id: r.driver.id, name: byId.get(r.driver.id)?.name || '—', phone: byId.get(r.driver.id)?.phone || '' };
    }
    const zoneIds = [...new Set(rows.filter((r) => r.zoneId && !r.zone).map((r) => r.zoneId))];
    if (zoneIds.length) {
        const zones = await FoodZone.find({ _id: { $in: zoneIds } }).select('name zoneName').lean();
        const byId = new Map(zones.map((z) => [String(z._id), z.name || z.zoneName]));
        for (const r of rows) if (r.zoneId && !r.zone) r.zone = byId.get(r.zoneId) || '';
    }

    // A City Manager only sees the zones of their own cities.
    const scoped = allowedZoneIds ? rows.filter((r) => r.zoneId && allowedZoneIds.includes(r.zoneId)) : rows;
    const needle = String(q || '').trim().toLowerCase();
    const filtered = scoped.filter((r) =>
        (!type || r.type === type) && (!slot || r.slot === slot) && (!status || r.status === status) &&
        (!needle || [r.orderId, r.customer.name, r.vendor, r.driver?.name].some((v) => String(v || '').toLowerCase().includes(needle)))
    );

    const count = (arr, fn) => arr.reduce((m, r) => ({ ...m, [fn(r)]: (m[fn(r)] || 0) + 1 }), {});
    const live = scoped.filter((r) => !['skipped', 'failed'].includes(r.status));
    return {
        date: dateStr,
        summary: {
            total: scoped.length,
            byType: count(scoped, (r) => r.type),
            byStatus: count(scoped, (r) => r.status),
            // Everything still to be delivered that nobody is assigned to: the admin's to-do list for the day.
            unassigned: live.filter((r) => !r.driver && !['delivered'].includes(r.status)).length,
            paymentIssues: scoped.filter((r) => ['Payment pending', 'Payment failed'].includes(r.payment.label)).length
        },
        orders: filtered
    };
};

export const orderDetail = async ({ kind, id }) => {
    if (!oid(id)) throw Object.assign(new Error('Invalid order id'), { statusCode: 400 });
    const keyOf = await shiftKeys();

    if (kind === 'pantry') {
        const po = await PantryOrder.findOne({ 'dailyDeliveries._id': id })
            .populate('userId', 'name phone email')
            .populate('vendorId', 'restaurantName zoneId')
            .lean();
        if (!po) throw Object.assign(new Error('Pantry order not found'), { statusCode: 404 });
        const dd = po.dailyDeliveries.find((x) => String(x._id) === String(id));
        const driver = dd?.driverId ? await FoodDeliveryPartner.findById(dd.driverId).select('name phone').lean() : null;
        return {
            order: {
                kind: 'pantry', id: String(dd._id), orderId: po.orderId, typeLabel: TYPE_LABEL.pantry, status: dd.status, slot: dd.slot,
                slotKey: keyOf.get(dd.slot) || dd.slot, date: new Date(dd.date).toISOString().slice(0, 10),
                customer: { name: po.userId?.name || '—', phone: po.userId?.phone || '', email: po.userId?.email || '' },
                vendor: po.vendorId?.restaurantName || '—', zoneId: String(po.zoneId || po.vendorId?.zoneId || '') || null,
                address: po.deliveryAddress ? [po.deliveryAddress.street, po.deliveryAddress.city, po.deliveryAddress.pincode].filter(Boolean).join(', ') : '',
                driver: driver ? { id: String(driver._id), name: driver.name, phone: driver.phone } : null,
                items: (po.items || []).map((i) => ({ name: i.title, quantity: i.quantity, price: i.price })),
                pricing: po.pricing, currency: 'PLN', paymentStatus: po.paymentStatus, deliveryPin: dd.deliveryPin || '',
                timeline: [{ label: 'Delivered', at: dd.deliveredAt || null }],
                failure: dd.failure?.reason ? dd.failure : null, crossZone: Boolean(po.crossZone)
            },
            subscription: null
        };
    }

    const o = await DMBDailyOrder.findById(id)
        .populate('userId', 'name phone email')
        .populate('vendorId', 'restaurantName')
        .populate('zoneId', 'name zoneName')
        .populate('dispatch.deliveryPartnerId', 'name phone')
        .lean();
    if (!o) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const sub = o.subscriptionId ? await DMBSubscription.findById(o.subscriptionId).select('subscriptionId duration status startDate endDate nextDeliveryDate pricing deliveryDays autoRenew').lean() : null;
    const driver = o.dispatch?.deliveryPartnerId;
    return {
        order: {
            kind: 'meal', id: String(o._id), orderId: o.orderId, type: o.orderType, typeLabel: TYPE_LABEL[o.orderType] || 'Order',
            status: o.status, slot: o.deliverySlot, slotKey: keyOf.get(o.deliverySlot) || o.deliverySlot, date: new Date(o.deliveryDate).toISOString().slice(0, 10),
            customer: { name: o.userId?.name || o.anonymisedAs || '—', phone: o.userId?.phone || '', email: o.userId?.email || '' },
            vendor: o.vendorId?.restaurantName || '—', zoneId: o.zoneId?._id ? String(o.zoneId._id) : null, zone: o.zoneId?.name || o.zoneId?.zoneName || '',
            address: o.deliveryAddress?.street && o.deliveryAddress?.city && !o.deliveryAddress.street.includes(o.deliveryAddress.city) ? `${o.deliveryAddress.street}, ${o.deliveryAddress.city}` : (o.deliveryAddress?.street || o.deliveryAddress?.city || ''),
            driver: driver ? { id: String(driver._id), name: driver.name, phone: driver.phone } : null,
            items: (o.meals || []).map((m) => ({ name: m.name, quantity: m.quantity, note: m.memberLabel || '' })),
            pricing: o.pricing, currency: o.pricing?.currency || 'PLN', paymentStatus: o.paymentStatus,
            collectionPin: o.collectionPin || '', deliveryPin: o.deliveryPin || '', specialInstructions: o.specialInstructions || '',
            timeline: [
                { label: 'Preparing', at: o.preparingAt }, { label: 'Ready', at: o.readyAt },
                { label: 'Picked up', at: o.pickedUpAt }, { label: 'Delivered', at: o.deliveredAt }
            ],
            failure: o.failure?.reason ? o.failure : null, gpsMismatch: Boolean(o.gpsMismatch), crossZone: Boolean(o.hasCrossZone),
            rating: o.isRated ? { overall: o.ratings?.overall ?? null, feedback: o.ratingFeedback || '' } : null
        },
        subscription: sub ? {
            id: String(sub._id), duration: sub.duration, status: sub.status, startDate: sub.startDate, endDate: sub.endDate,
            nextDeliveryDate: sub.nextDeliveryDate, deliveryDays: sub.deliveryDays, autoRenew: Boolean(sub.autoRenew), total: sub.pricing?.totalPrice ?? null
        } : null
    };
};
