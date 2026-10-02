import { notifyMany } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';

/**
 * Gap AK: rotation billing = sum of each maker's meal price × their days. When a maker changes a meal's price, the
 * customers rotating with that meal are told their next period's cost changes (the current, prepaid period does not).
 */
export const notifyRotationPriceChange = async (mealPlan) => {
    const { DMBSubscription } = await import('./subscription.model.js');
    const subs = await DMBSubscription.find({ status: { $in: ['active', 'paused'] }, subscriptionType: 'rotation', 'rotation.mealPlanId': mealPlan._id }).select('userId').lean();
    if (!subs.length) return { notified: 0 };
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const vendor = await FoodRestaurant.findById(mealPlan.vendorId).select('restaurantName').lean();
    const res = await notifyMany([...new Set(subs.map((s) => String(s.userId)))].map((id) => ({ id })), {
        to: 'customer', event: 'renewal_reminder',
        title: msg('A maker in your rotation changed a price'),
        body: msg('{{vendor}} updated the price of {{meal}} to {{price}}. Your next rotation period will be priced with it.', { vendor: vendor?.restaurantName || '', meal: mealPlan.name, price: mealPlan.pricePerDay }),
        link: '/user/profile'
    });
    return { notified: res.sent };
};
