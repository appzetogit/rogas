import mongoose from 'mongoose';
import { notify } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';
import { raiseAdminAlert } from '../platform/platformConfig.service.js';

/**
 * DA-07 "Cannot deliver" report (Gap P). Records the reason, a photo (mandatory, ACM-26) and what happened to the box:
 *   held_by_driver | returned_to_vendor | left_with_neighbour | returned_to_shop (Pantry bags only)
 * The customer is told (critical notification), the vendor/shop is told when the box comes back to them, and Customer
 * Service gets an alert to follow up (refund / redelivery).
 */

export const DISPOSITIONS = ['held_by_driver', 'returned_to_vendor', 'left_with_neighbour', 'returned_to_shop'];
export const REASONS = ['no_one_home', 'wrong_address', 'customer_refused', 'access_issue', 'other'];

export class FailedDeliveryError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

const validate = ({ reason, disposition, photoUrl, note }) => {
    if (!REASONS.includes(reason)) throw new FailedDeliveryError('Choose why the delivery failed');
    if (!DISPOSITIONS.includes(disposition)) throw new FailedDeliveryError('Choose what happened to the box');
    if (!/^https?:\/\//i.test(String(photoUrl || ''))) throw new FailedDeliveryError('A photo is required for a failed delivery');
    return { reason, disposition, photoUrl: String(photoUrl), note: String(note || '').trim().slice(0, 300) };
};

export const reportFailedDelivery = async ({ driverId, stopType = 'dmb', id, ...input }) => {
    const data = validate(input);
    const failure = { ...data, reportedAt: new Date() };

    if (stopType === 'pantry') {
        const { PantryOrder } = await import('../../food/restaurant/models/pantryOrder.model.js');
        const order = await PantryOrder.findOne({ 'dailyDeliveries._id': id });
        if (!order) throw new FailedDeliveryError('Delivery not found', 404);
        const dd = order.dailyDeliveries.id(id);
        // The driver is set at pickup (collection PIN); only the driver carrying the bag can report it failed.
        if (!dd.driverId || String(dd.driverId) !== String(driverId)) throw new FailedDeliveryError('This delivery is not assigned to you', 403);
        if (['delivered', 'failed'].includes(dd.status)) throw new FailedDeliveryError(`This delivery is already ${dd.status}`);
        dd.status = 'failed';
        dd.failure = failure;
        dd.returnStatus = data.disposition === 'returned_to_shop' ? 'returned_to_shop' : 'none';
        await order.save();
        const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
        const driver = await FoodDeliveryPartner.findById(driverId).select('name').lean();
        if (data.disposition === 'returned_to_shop' || data.disposition === 'returned_to_vendor') {
            const items = (order.items || []).map((i) => `${i.title} x${i.quantity}`).join(', ');
            await notify({
                to: 'vendor', id: order.vendorId, event: 'pantry_return',
                title: msg('Bag returned by driver'),
                body: msg('1 bag returned by driver {{driver}}. Items: {{items}}.', { driver: driver?.name || '', items }),
                data: { pantryOrderId: String(order._id), deliveryId: String(id) }
            });
        }
        await notify({ to: 'customer', id: order.userId, event: 'delivery_failed', title: msg('We could not deliver your Pantry Box'), body: msg('Our driver could not complete the delivery. Customer support will contact you.'), link: '/user/orders' });
        await raiseAdminAlert({ type: 'delivery_failed', severity: 'warning', title: `Pantry delivery failed (${order.orderId})`, message: `${data.reason} — ${data.disposition}`, entityType: 'PantryOrder', entityId: order._id, link: '/admin/food/dmb/pantry-returns' });
        return { type: 'pantry', status: 'failed', returnStatus: dd.returnStatus };
    }

    if (data.disposition === 'returned_to_shop') throw new FailedDeliveryError('"Returned to shop" applies to Pantry Box bags only');
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    if (!mongoose.Types.ObjectId.isValid(String(id))) throw new FailedDeliveryError('Delivery not found', 404);
    const order = await DMBDailyOrder.findById(id);
    if (!order) throw new FailedDeliveryError('Delivery not found', 404);
    // dispatch.deliveryPartnerId is set at pickup; only the driver carrying the box can report it failed.
    if (!order.dispatch?.deliveryPartnerId || String(order.dispatch.deliveryPartnerId) !== String(driverId)) throw new FailedDeliveryError('This delivery is not assigned to you', 403);
    if (['delivered', 'failed', 'skipped'].includes(order.status)) throw new FailedDeliveryError(`This delivery is already ${order.status}`);
    order.status = 'failed';
    order.failure = { ...failure, reportedBy: driverId };
    await order.save();
    await notify({
        to: 'customer', id: order.userId, event: 'delivery_failed',
        title: msg('We could not deliver your meal'),
        body: msg('Our driver could not complete today\'s delivery. Customer support will contact you about a refund or redelivery.'),
        link: '/user/orders', data: { orderId: String(order._id) }
    });
    if (data.disposition === 'returned_to_vendor') {
        await notify({ to: 'vendor', id: order.vendorId, event: 'delivery_returned', title: msg('A box is coming back to you'), body: msg('Order {{order}} could not be delivered and is being returned.', { order: order.orderId }) });
    }
    await raiseAdminAlert({ type: 'delivery_failed', severity: 'warning', title: `Delivery failed (${order.orderId})`, message: `${data.reason} — ${data.disposition}`, entityType: 'DMBDailyOrder', entityId: order._id, link: '/admin/food/dmb/alerts' });
    try {
        const { getIO } = await import('../../../config/socket.js');
        const io = getIO();
        io?.to(`sub_${order.subscriptionId}`).emit('order_status_updated', { _id: order._id, orderId: order.orderId, status: 'failed', updatedAt: new Date().toISOString() });
        io?.to(`vendor_${order.vendorId}`).emit('order_status_update', { _id: order._id, orderId: order.orderId, status: 'failed' });
    } catch { /* sockets optional */ }
    return { type: 'dmb', status: 'failed' };
};
