import { FoodUserDietaryPreferences } from '../models/dietaryPreferences.model.js';

export const getDietaryPreferences = async (userId) => {
    let prefs = await FoodUserDietaryPreferences.findOne({ userId });
    
    // If not found, create a default one
    if (!prefs) {
        prefs = new FoodUserDietaryPreferences({
            userId,
            dietType: "No preference",
            allergies: [],
            weeklyBudget: 1500
        });
        await prefs.save();
    }
    
    return prefs;
};

export const updateDietaryPreferences = async (userId, data) => {
    const { dietType, allergies, weeklyBudget } = data;
    
    let prefs = await FoodUserDietaryPreferences.findOne({ userId });
    
    if (!prefs) {
        prefs = new FoodUserDietaryPreferences({ userId });
    }
    
    if (dietType !== undefined) prefs.dietType = dietType;
    if (allergies !== undefined && Array.isArray(allergies)) prefs.allergies = allergies;
    if (weeklyBudget !== undefined) prefs.weeklyBudget = Number(weeklyBudget);
    
    await prefs.save();
    return prefs;
};
