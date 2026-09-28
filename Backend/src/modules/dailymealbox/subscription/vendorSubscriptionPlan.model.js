import mongoose from 'mongoose';

/**
 * VendorSubscriptionPlan — duration + fee template shared by every vendor (e.g. "Weekly", "Monthly").
 * Admin sets the things that are genuinely platform-wide policy: which durations exist, VAT rates and the
 * platform fee. The food price itself is NOT set here — it comes from the vendor's own DMBMealPlan.pricePerDay
 * (Menu Management), multiplied by this plan's day count. `price` is kept only so old records keep whatever
 * value they were created with; nothing reads it to charge a customer any more.
 */
const vendorSubscriptionPlanSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        /** @deprecated no longer used to charge customers — see file comment. Kept for old records only. */
        price: {
            type: Number,
            default: 0,
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
