import mongoose from 'mongoose';

const pantryItemSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        image: {
            type: String,
            required: true
        },
        isAvailable: {
            type: Boolean,
            default: true
        }
    },
    {
        collection: 'food_pantry_items',
        timestamps: true
    }
);

export const PantryItem = mongoose.model('PantryItem', pantryItemSchema);
