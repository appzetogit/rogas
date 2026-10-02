import { visibilityFor, driverCustomerView, driverPricingView } from '../platform/visibility.js';

/**
 * Adds the Amendment v2 Extra driver-route details to stops built by driver.routes.js:
 *   AL  hasColdMeals → "❄ Cold meals in today's route — use insulated bag" banner (once per route)
 *   AF  setCount / isFamilyBox per delivery stop ("Maria K. — Family Box × 3 sets")
 *   O   customer name / phone / order value masked per ACM-141/142/143
 * `orders` are the DMBDailyOrder (or pantry) objects the stops were built from; `zoneId` picks the city's controls.
 */
export const enrichDriverRoute = async ({ stops = [], orders = [], zoneId }) => {
    const vis = await visibilityFor('driver', { zoneId });
    const byId = new Map(orders.map((o) => [String(o._id), o]));
    let hasColdMeals = false;
    const out = stops.map((stop) => {
        const isDelivery = stop.type === 'delivery' || stop.type === 'D';
        if (!isDelivery) return stop;
        const order = byId.get(String(stop.orderId));
        if (!order) return stop;
        if (order.hasColdMeal || (order.meals || []).some((m) => m.temperatureType === 'cold')) hasColdMeals = true;
        const who = driverCustomerView({ name: order.userId?.name || stop.name, phone: order.userId?.phone || stop.phone }, vis);
        return {
            ...stop,
            name: who.name,
            ...(stop.phone !== undefined ? { phone: who.phone } : {}),
            isFamilyBox: Boolean(order.isFamilyBox),
            setCount: order.setCount || 1,
            hasColdMeal: Boolean(order.hasColdMeal),
            orderType: order.orderType || order.type || 'subscription',
            pricing: driverPricingView(order.pricing || {}, vis),
            ...(vis.visDriverEarningsBreakdown ? {} : { riderEarning: undefined })
        };
    });
    // Orders also travel in full in some responses — mask them the same way.
    const maskedOrders = orders.map((o) => ({
        ...o,
        userId: o.userId ? { ...o.userId, ...driverCustomerView({ name: o.userId.name, phone: o.userId.phone }, vis) } : o.userId,
        pricing: driverPricingView(o.pricing || {}, vis)
    }));
    return { stops: out, orders: maskedOrders, hasColdMeals, coldBagNotice: hasColdMeals ? 'Cold meals in today\'s route — use insulated bag' : null };
};
