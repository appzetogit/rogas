import { getDietaryPreferences, updateDietaryPreferences } from '../services/dietaryPreferences.service.js';
import { sendResponse } from '../../../../utils/response.js';

export const getDietaryPreferencesController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const preferences = await getDietaryPreferences(userId);
        return sendResponse(res, 200, 'Dietary preferences fetched successfully', { preferences });
    } catch (error) {
        next(error);
    }
};

export const updateDietaryPreferencesController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const preferences = await updateDietaryPreferences(userId, req.body);
        return sendResponse(res, 200, 'Dietary preferences updated successfully', { preferences });
    } catch (error) {
        next(error);
    }
};
