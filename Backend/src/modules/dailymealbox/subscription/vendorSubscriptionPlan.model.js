import mongoose from 'mongoose';

/**
 * VendorSubscriptionPlan — Platform subscription plan model for Vendors
 * Tracks available subscription packages created by admin that vendors can buy/subscribe to.
 * Durations: day (One Day), week (One Week), month (One Month)
 */
const vendorSubscriptionPlanSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        duration: {
            type: String,
            enum: ['day', 'week', 'month'],
            required: true
        },
        description: {
            type: String,
            default: '',
            trim: true
        },
        features: {
            type: [String],
            default: []
        },
        foodVat: {
            type: Number,
            default: 0,
            min: 0
        },
        deliveryVat: {
            type: Number,
            default: 0,
            min: 0
        },
        platformFee: {
            type: Number,
            default: 0,
            min: 0
        },
        deliveryDays: {
            type: String,
            enum: ['mon_fri', 'full_week'],
            default: 'full_week'
        },
        applyFoodVatOnMenu: {
            type: Boolean,
            default: false
        },
        daysCount: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true
        }
    },
    {
        timestamps: true,
        collection: 'vendor_subscription_plans'
    }
);

// Index for status and sorted creation lookup
vendorSubscriptionPlanSchema.index({ status: 1, createdAt: -1 });

export const VendorSubscriptionPlan = mongoose.model('VendorSubscriptionPlan', vendorSubscriptionPlanSchema);
