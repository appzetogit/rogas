import { sendResponse, sendError } from '../../../../utils/response.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { getRestaurantFinance, getVendorEarningsSummary } from '../services/restaurantFinance.service.js';

export const createWithdrawalRequestController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const { amount, bankDetails } = req.body;

        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');
        if (!amount || amount <= 0) return sendError(res, 400, 'Invalid withdrawal amount');

        // Check if restaurant has enough balance
        const earningsSummary = await getVendorEarningsSummary(restaurantId);
        const availableBalance = earningsSummary?.summary?.availableBalance ?? 0;

        if (amount > availableBalance) {
            return sendError(res, 400, `Insufficient balance. Available: ₹${availableBalance}`);
        }

        // Fetch restaurant details to get current bank info as fallback
        const restaurant = await FoodRestaurant.findById(restaurantId).lean();
        if (!restaurant) return sendError(res, 404, 'Restaurant not found');

        const finalBankDetails = {
            accountNumber: bankDetails?.accountNumber || restaurant.accountNumber || '',
            ifscCode: bankDetails?.ifscCode || restaurant.ifscCode || '',
            bankName: bankDetails?.bankName || restaurant.bankName || 'Bank',
            accountHolderName: bankDetails?.accountHolderName || restaurant.accountHolderName || '',
            upiId: bankDetails?.upiId || restaurant.upiId || '',
            upiQrImage: bankDetails?.upiQrImage || restaurant.upiQrImage || ''
        };

        // Create the withdrawal request
        const withdrawal = new FoodRestaurantWithdrawal({
            restaurantId,
            amount,
            bankDetails: finalBankDetails,
            status: 'pending'
        });

        await withdrawal.save();

        return sendResponse(res, 201, 'Withdrawal request submitted successfully', withdrawal);
    } catch (error) {
        next(error);
    }
};

export const listMyWithdrawalsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const withdrawals = await FoodRestaurantWithdrawal.find({ restaurantId })
            .sort({ createdAt: -1 })
            .lean();

        return sendResponse(res, 200, 'Withdrawals fetched successfully', withdrawals);
    } catch (error) {
        next(error);
    }
};
