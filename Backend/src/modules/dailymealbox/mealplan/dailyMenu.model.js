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
        slot: {
            type: String,
            required: true,
            index: true
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

// Compound index to ensure uniqueness per vendor, meal plan, date, and slot
dailyMenuSchema.index({ vendorId: 1, mealPlanId: 1, date: 1, slot: 1 }, { unique: true });

export const DMBDailyMenu = mongoose.model('DMBDailyMenu', dailyMenuSchema);

// Try to drop the legacy unique index if it exists
mongoose.connection.on('connected', async () => {
    try {
        const db = mongoose.connection.db;
        if (db) {
            const collection = db.collection('dmb_daily_menus');
            await collection.dropIndex('vendorId_1_mealPlanId_1_date_1');
            console.log('Successfully dropped legacy daily menu unique index: vendorId_1_mealPlanId_1_date_1');
        }
    } catch (e) {
        // Index might not exist, ignore
    }
});
