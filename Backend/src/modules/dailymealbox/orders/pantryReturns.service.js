import mongoose from 'mongoose';
import { localToday, addDays, storageDateStr } from '../../../utils/platformTime.js';

/**
 * Returned / unsold Pantry Box stock (Gap P). A failed pantry delivery the driver marks "returned to shop" shows up for
 * the shop partner, who restocks it; admins get a per-item return report (AP-11, downloadable as CSV).
 */

const PantryOrderModel = async () => (await import('../../food/restaurant/models/pantryOrder.model.js')).PantryOrder;

export const pantryReturnsForVendor = async (vendorId, { status } = {}) => {
    const PantryOrder = await PantryOrderModel();
    const orders = await PantryOrder.find({ vendorId, 'dailyDeliveries.returnStatus': { $in: status ? [status] : ['returned_to_shop', 'restocked'] } })
        .select('orderId items dailyDeliveries userId').populate('dailyDeliveries.driverId', 'name').lean();
    const out = [];
    for (const o of orders) {
        for (const d of o.dailyDeliveries || []) {
            if (!['returned_to_shop', 'restocked'].includes(d.returnStatus)) continue;
            if (status && d.returnStatus !== status) continue;
            out.push({
                deliveryId: d._id, orderId: o.orderId, date: d.date, slot: d.slot, returnStatus: d.returnStatus, restockedAt: d.restockedAt,
                driverName: d.driverId?.name || '', reason: d.failure?.reason || '', reportedAt: d.failure?.reportedAt,
                items: (o.items || []).map((i) => ({ title: i.title, quantity: i.quantity }))
            });
        }
    }
    return out.sort((a, b) => new Date(b.reportedAt || 0) - new Date(a.reportedAt || 0));
};

export const markReturnRestocked = async (vendorId, deliveryId) => {
    const PantryOrder = await PantryOrderModel();
    const res = await PantryOrder.findOneAndUpdate(
        { vendorId, 'dailyDeliveries._id': deliveryId, 'dailyDeliveries.returnStatus': 'returned_to_shop' },
        { $set: { 'dailyDeliveries.$.returnStatus': 'restocked', 'dailyDeliveries.$.restockedAt': new Date() } },
        { new: true }
    ).lean();
    if (!res) throw Object.assign(new Error('Returned bag not found'), { statusCode: 404 });
    return res.dailyDeliveries.find((d) => String(d._id) === String(deliveryId));
};

/** AP-11: which pantry items come back most (last `days` days). */
export const pantryReturnReport = async ({ days = 7, vendorId } = {}) => {
    const PantryOrder = await PantryOrderModel();
    const since = addDays(localToday(), -Math.max(1, Math.min(Number(days) || 7, 365)));
    const match = { 'dailyDeliveries.date': { $gte: since } };
    if (vendorId && mongoose.Types.ObjectId.isValid(String(vendorId))) match.vendorId = new mongoose.Types.ObjectId(String(vendorId));
    const rows = await PantryOrder.aggregate([
        { $match: match },
        { $unwind: '$dailyDeliveries' },
        { $match: { 'dailyDeliveries.date': { $gte: since }, 'dailyDeliveries.status': { $in: ['delivered', 'failed'] } } },
        { $unwind: '$items' },
        {
            $group: {
                _id: { title: '$items.title', vendorId: '$vendorId' },
                delivered: { $sum: { $cond: [{ $eq: ['$dailyDeliveries.status', 'delivered'] }, '$items.quantity', 0] } },
                returned: { $sum: { $cond: [{ $in: ['$dailyDeliveries.returnStatus', ['returned_to_shop', 'restocked']] }, '$items.quantity', 0] } },
                total: { $sum: '$items.quantity' }
            }
        },
        { $sort: { returned: -1 } }
    ]);
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const names = new Map((await FoodRestaurant.find({ _id: { $in: rows.map((r) => r._id.vendorId) } }).select('restaurantName').lean()).map((v) => [String(v._id), v.restaurantName]));
    return {
        since: storageDateStr(since),
        items: rows.map((r) => ({
            itemName: r._id.title, shop: names.get(String(r._id.vendorId)) || '', delivered: r.delivered, returned: r.returned,
            returnRate: r.total ? Math.round((r.returned / r.total) * 1000) / 10 : 0
        }))
    };
};

export const toCsv = (rows, columns) => {
    const esc = (v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [columns.map((c) => c.label).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\n');
};
