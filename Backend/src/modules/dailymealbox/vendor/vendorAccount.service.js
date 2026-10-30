import mongoose from 'mongoose';
import { DMBSubscription } from '../subscription/subscription.model.js';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { VendorSubscriptionPlan } from '../subscription/vendorSubscriptionPlan.model.js';
import { vendorSubscribersFilter } from '../subscription/vendorPlans.service.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { DMBDailyMenu } from '../mealplan/dailyMenu.model.js';
import { PantryItem } from '../../food/restaurant/models/pantryItem.model.js';
import { PantryOrder } from '../../food/restaurant/models/pantryOrder.model.js';
import { deleteRestaurantAccount } from '../../food/restaurant/services/deleteAccount.service.js';
import { localToday } from '../../../utils/platformTime.js';

/**
 * Vendor "delete my account". A kitchen can only leave when it owes nobody anything: no live subscribers, no meal still
 * to be delivered, no pantry bag still to be delivered and no money waiting to be paid out. Every blocker below is
 * counted from the real records — a brand-new kitchen has none, so it can be deleted straight away.
 */

const OPEN_ORDER_STATUSES = ['scheduled', 'preparing', 'ready', 'hub_transit', 'out_for_delivery'];

const oid = (id) => new mongoose.Types.ObjectId(String(id));

export const accountBlockers = async (vendorId) => {
    const id = oid(vendorId);
    const today = localToday();
    const db = mongoose.connection.db;

    const [subscribers, openOrders, openPantry, wallet, withdrawals] = await Promise.all([
        DMBSubscription.countDocuments(vendorSubscribersFilter(vendorId)),
        // Orders still to be delivered from today on. Single meals that were never paid do not count.
        DMBDailyOrder.countDocuments({
            vendorId: id,
            deliveryDate: { $gte: today },
            status: { $in: OPEN_ORDER_STATUSES },
            paymentStatus: { $nin: ['pending', 'failed'] }
        }),
        PantryOrder.countDocuments({ vendorId: id, status: 'paid', dailyDeliveries: { $elemMatch: { status: { $nin: ['delivered', 'failed'] } } } }),
        db.collection('food_restaurant_wallets').findOne({ restaurantId: id }),
        db.collection('food_restaurant_withdrawals').countDocuments({ restaurantId: id, status: 'pending' })
    ]);

    const balance = Number(wallet?.balance) || 0;
    const blockers = [];
    if (subscribers) blockers.push({ code: 'SUBSCRIBERS', count: subscribers, message: `${subscribers} customer${subscribers === 1 ? ' has' : 's have'} an active or paused subscription with you.` });
    if (openOrders) blockers.push({ code: 'OPEN_ORDERS', count: openOrders, message: `${openOrders} order${openOrders === 1 ? ' is' : 's are'} still to be prepared or delivered.` });
    if (openPantry) blockers.push({ code: 'OPEN_PANTRY', count: openPantry, message: `${openPantry} pantry order${openPantry === 1 ? ' still has' : 's still have'} bags to deliver.` });
    if (balance > 0) blockers.push({ code: 'BALANCE', count: 1, message: 'You still have an unpaid balance. Withdraw it first.' });
    if (withdrawals) blockers.push({ code: 'WITHDRAWALS', count: withdrawals, message: `${withdrawals} withdrawal request${withdrawals === 1 ? ' is' : 's are'} still pending.` });
    return blockers;
};

export const deleteVendorAccount = async (vendorId) => {
    const blockers = await accountBlockers(vendorId);
    if (blockers.length) {
        throw Object.assign(new Error('Your account cannot be deleted yet'), { statusCode: 409, code: 'ACCOUNT_BLOCKED', blockers });
    }
    const id = oid(vendorId);
    // The kitchen's own catalogue goes with it, so customers never see a deleted kitchen's meals or plans.
    await Promise.all([
        DMBMealPlan.deleteMany({ vendorId: id }),
        DMBDailyMenu.deleteMany({ vendorId: id }),
        VendorSubscriptionPlan.deleteMany({ vendorId: id }),
        PantryItem.deleteMany({ vendorId: id })
    ]);
    // Then the existing deletion: keeps the financial snapshot, anonymises history and removes the kitchen record.
    return deleteRestaurantAccount(String(vendorId));
};
