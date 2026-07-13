import { FoodUserWallet } from '../../user/models/userWallet.model.js';
import { sendResponse } from '../../../../utils/response.js';

export const getAllCustomerWalletsController = async (req, res, next) => {
    try {
        // Fetch all wallets and populate the user details
        const wallets = await FoodUserWallet.find()
            .populate({ path: 'userId', model: 'FoodUser', select: 'name email phone profileImage' })
            .sort({ updatedAt: -1 });
        
        return sendResponse(res, 200, 'Customer wallets fetched successfully', { wallets });
    } catch (error) {
        next(error);
    }
};
