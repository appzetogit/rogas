import { sendResponse, sendError } from '../../../../utils/response.js';
import { getRestaurantFinance, getVendorEarningsSummary } from '../services/restaurantFinance.service.js';

export const getRestaurantFinanceController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const data = await getRestaurantFinance(restaurantId, req.query || {});
        // `sendResponse` already uses `data` as the top-level payload key.
        return sendResponse(res, 200, 'Finance fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/v1/food/restaurant/earnings
 * Returns a live dynamic earnings breakdown for the Vendor Panel.
 */
export const getVendorEarningsSummaryController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const tab = req.query.tab;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const data = await getVendorEarningsSummary(restaurantId, tab, page, limit);
        if (!data) return sendError(res, 404, 'Restaurant not found');
        return sendResponse(res, 200, 'Earnings fetched successfully', data);
    } catch (error) {
        next(error);
    }
};
