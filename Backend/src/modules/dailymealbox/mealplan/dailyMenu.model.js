import mongoose from 'mongoose';

const dailyMenuSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        mealPlanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBMealPlan',
            required: true,
            index: true
        },
        date: {
            type: Date,
            required: true,
            index: true
        },
        dishName: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            default: '',
            trim: true
        },
        photo: {
            type: String,
            default: ''
        },
        nutrition: {
            calories: { type: Number, default: null },
            protein: { type: Number, default: null },
            carbs: { type: Number, default: null },
            fats: { type: Number, default: null }
        }
    },
    {
        collection: 'dmb_daily_menus',
        timestamps: true
    }
);

// Compound index to ensure uniqueness per vendor, meal plan, and date
dailyMenuSchema.index({ vendorId: 1, mealPlanId: 1, date: 1 }, { unique: true });

export const DMBDailyMenu = mongoose.model('DMBDailyMenu', dailyMenuSchema);
