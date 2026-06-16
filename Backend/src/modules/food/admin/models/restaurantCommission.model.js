import mongoose from 'mongoose';

const restaurantCommissionSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            unique: true,
            index: true
        },
        /**
         * Commission VAT % — percentage of gross subtotal taken as platform commission.
         * Previously named "Default Commission".
         */
        defaultCommission: {
            type: {
                type: String,
                enum: ['percentage', 'amount'],
                default: 'percentage'
            },
            value: { type: Number, default: 0 }
        },
        /**
         * Platform Commission VAT % — additional platform VAT on top of base commission.
         * Defaults to 0 so existing records are unaffected.
         */
        platformCommissionVatPercent: { type: Number, default: 0, min: 0, max: 100 },
        /**
         * Food VAT % Per Meal — food/GST tax percentage deducted from vendor earnings.
         * Defaults to 0 so existing records are unaffected.
         */
        foodVatPercent: { type: Number, default: 0, min: 0, max: 100 },
        notes: { type: String, trim: true, default: '' },
        status: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_restaurant_commissions', timestamps: true }
);


export const FoodRestaurantCommission = mongoose.model('FoodRestaurantCommission', restaurantCommissionSchema);

