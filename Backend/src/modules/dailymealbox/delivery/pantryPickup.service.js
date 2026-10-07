import crypto from 'crypto';
import mongoose from 'mongoose';
import { PantryOrder } from '../../food/restaurant/models/pantryOrder.model.js';

/**
 * Pantry bags travel on the same pickup batches as meals: a CollectionBatch lists the ids of the things to collect from
 * one vendor, one date and one slot. For a pantry shop those ids are the `dailyDeliveries._id` of paid pantry orders
 * (one bag per delivery day and slot), so a driver can collect from a kitchen and a shop on one route.
 */

export const newDeliveryPin = () => String(crypto.randomInt(1000, 10000));

const dayRange = (date) => {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
};

/** The pantry bags a vendor has to hand over on a date and slot (paid orders only), each with its parent order. */
export const pantryUnitsFor = async ({ vendorId, date, slot }) => {
    const { start, end } = dayRange(date);
    const orders = await PantryOrder.find({
        vendorId,
        status: 'paid',
        dailyDeliveries: { $elemMatch: { date: { $gte: start, $lt: end }, slot } }
    }).populate('userId', 'name phone');
    const units = [];
    for (const po of orders) {
        for (const dd of po.dailyDeliveries) {
            if (dd.slot === slot && dd.date >= start && dd.date < end) units.push({ order: po, delivery: dd });
        }
    }
    return units;
};

/** A driver accepted the pickup: every bag in it is theirs. */
export const assignPantryDriver = async (ids, driverId) => {
    if (!ids?.length) return;
    await PantryOrder.updateMany(
        { 'dailyDeliveries._id': { $in: ids } },
        { $set: { 'dailyDeliveries.$[d].driverId': driverId } },
        { arrayFilters: [{ 'd._id': { $in: ids }, 'd.driverId': null }] }
    );
};

/** The driver collected the batch: the bags are out for delivery and the driver is recorded on each. */
export const markPantryCollected = async (ids, driverId) => {
    if (!ids?.length) return;
    await PantryOrder.updateMany(
        { 'dailyDeliveries._id': { $in: ids } },
        { $set: { 'dailyDeliveries.$[d].status': 'out_for_delivery', 'dailyDeliveries.$[d].driverId': driverId } },
        { arrayFilters: [{ 'd._id': { $in: ids }, 'd.status': { $in: ['scheduled', 'preparing', 'ready'] } }] }
    );
};

/** One bag (delivery) by its id, with the order it belongs to; null when the id is not a pantry bag. */
export const findPantryDelivery = async (deliveryId) => {
    if (!mongoose.Types.ObjectId.isValid(String(deliveryId))) return null;
    const order = await PantryOrder.findOne({ 'dailyDeliveries._id': deliveryId });
    if (!order) return null;
    return { order, delivery: order.dailyDeliveries.id(deliveryId) };
};
