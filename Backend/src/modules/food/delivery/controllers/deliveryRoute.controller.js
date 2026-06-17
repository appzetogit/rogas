/**
 * deliveryRoute.controller.js
 *
 * HTTP handlers for the delivery partner route optimization API.
 * All routes require DELIVERY_PARTNER authentication.
 *
 * GET  /food/delivery/route           → getMyRoute
 * POST /food/delivery/route/recalculate → recalculateMyRoute
 */

import { getPartnerRoute, buildRouteForPartner } from '../services/deliveryRoute.service.js';
import { sendResponse } from '../../../../utils/response.js';

/**
 * GET /food/delivery/route
 * Returns the delivery partner's current optimized route (last computed).
 * Does NOT trigger a recalculation — use /recalculate for that.
 */
export const getMyRouteController = async (req, res, next) => {
    try {
        const partnerId = req.user?.userId;
        const route = await getPartnerRoute(partnerId);

        if (!route) {
            return sendResponse(res, 200, 'No route computed yet. Use /recalculate to generate one.', {
                route: null,
                stops: [],
                totalStops: 0,
                totalOrders: 0,
                totalDistanceMeters: 0,
                generatedAt: null
            });
        }

        return sendResponse(res, 200, 'Route fetched successfully', { route });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /food/delivery/route/recalculate
 * Triggers a fresh VRP route computation for the authenticated delivery partner.
 * Fetches their current active orders, runs the VRP solver, and persists the result.
 */
export const recalculateMyRouteController = async (req, res, next) => {
    try {
        const partnerId = req.user?.userId;
        const route = await buildRouteForPartner(partnerId);

        return sendResponse(res, 200, 'Route recalculated successfully', { route });
    } catch (error) {
        next(error);
    }
};
