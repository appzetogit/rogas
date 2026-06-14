import mongoose from 'mongoose';

const deliveryOrderFeeSettingsSchema = new mongoose.Schema(
    {
        feePerOrder: {
            type: Number,
            default: 0,
            min: 0,
            required: true
        },
        commissionPerDay: {
            type: Number,
            default: 0,
            min: 0
        },
        commissionPerWeek: {
            type: Number,
            default: 0,
            min: 0
        },
        commissionPerMonth: {
            type: Number,
            default: 0,
            min: 0
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

export const DeliveryOrderFeeSettings = mongoose.model(
    'DeliveryOrderFeeSettings',
    deliveryOrderFeeSettingsSchema,
    'food_delivery_order_fee_settings'
);
