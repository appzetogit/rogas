import mongoose from 'mongoose';

/**
 * VendorSubscriptionPlan — a subscription plan (e.g. "Weekly", "Monthly").
 * Vendors create their OWN plans (vendorId set): name, duration, delivery days, description and an optional plan discount.
 * Their VAT rates and platform fee are not typed by the vendor: they are copied from the platform terms when the plan is
 * created (see vendorPlans.service.js). Plans with vendorId = null are the old platform-wide templates; they are no longer
 * edited anywhere, and only serve as the platform terms (VAT / fee) for one-off orders, rotations and office assignments.
 * The food price itself is NOT set here — it comes from the vendor's own DMBMealPlan.pricePerDay (Menu Management),
 * multiplied by this plan's day count. `price` is kept only so old records keep whatever value they were created with;
 * nothing reads it to charge a customer any more.
 */
const vendorSubscriptionPlanSchema = new mongoose.Schema(
    {
        /** Owner of the plan. null = old platform-wide template (see file comment). */
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            default: null,
            index: true
        },
        /** Plan discount on the food price, set by the vendor (0-50 %). */
        discountPercent: {
            type: Number,
            default: 0,
            min: 0,
            max: 50
        },
        /** Set on the per-vendor copies made from an old platform template, so the copy runs once. */
        copiedFromId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
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
        /** fortnight (Gap L, ACM-151) and year (Gap C, ACM-149) are offered only while their control is on. */
        duration: {
            type: String,
            enum: ['day', 'week', 'fortnight', 'month', 'year'],
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
vendorSubscriptionPlanSchema.index({ vendorId: 1, status: 1 });

export const VendorSubscriptionPlan = mongoose.model('VendorSubscriptionPlan', vendorSubscriptionPlanSchema);
