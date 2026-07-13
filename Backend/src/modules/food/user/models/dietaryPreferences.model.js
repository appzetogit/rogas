import mongoose from 'mongoose';

const dietaryPreferencesSchema = new mongoose.Schema(
    {
        userId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'FoodUser', 
            required: true, 
            unique: true, 
            index: true 
        },
        dietType: { 
            type: String, 
            default: 'No preference' 
        },
        allergies: { 
            type: [String], 
            default: [] 
        },
        weeklyBudget: { 
            type: Number, 
            default: 1500 
        }
    },
    { collection: 'food_user_dietary_preferences', timestamps: true }
);

export const FoodUserDietaryPreferences = mongoose.model('FoodUserDietaryPreferences', dietaryPreferencesSchema);
