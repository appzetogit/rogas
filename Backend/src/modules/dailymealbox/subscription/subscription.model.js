import mongoose from 'mongoose';

/**
 * DMBSubscription — Core subscription model for DailyMealBox
 * Tracks recurring meal subscriptions: active, paused, cancelled
 * PRD Reference: CA-07 (Checkout), CA-12 (Calendar), CA-15 (Profile)
 */

const deliveryAddressSchema = new mongoose.Schema(
    {
        label: { type: String, enum: ['Home', 'Office', 'Other'], default: 'Home' },
        fullName: { type: String, default: '', trim: true },
        street: { type: String, required: true, trim: true },
        additionalDetails: { type: String, default: '', trim: true },
        city: { type: String, required: true, trim: true },
        state: { type: String, required: true, trim: true },
        zipCode: { type: String, default: '', trim: true },
        phone: { type: String, default: '', trim: true },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: undefined }
        }
    },
    { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
    {
        /** Human-readable subscription ID e.g. DMB-SUB-12345 */
        subscriptionId: {
            type: String,
            unique: true,
            sparse: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true,
            index: true
        },
        /** Vendor (Restaurant/Home Cook/Cloud Kitchen) providing the meals */
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        /** Delivery zone for the subscription */
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone',
            index: true
        },
        /** Meal plan subscribed to (kept for backward compatibility, now optional) */
        mealPlanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBMealPlan',
            required: false,
            index: true
        },
        /** Multiple meal plans with quantities */
        meals: [
            {
                mealPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBMealPlan', required: true },
                quantity: { type: Number, default: 1, min: 1 }
            }
        ],
        /** Subscription duration plan code (e.g. one_day, weekly, monthly) */
        duration: {
            type: String,
            required: true,
            default: 'weekly'
        },
        status: {
            type: String,
            enum: ['active', 'paused', 'cancelled', 'pending_payment', 'expired'],
            default: 'pending_payment',
            index: true
        },
        /** Always starts on next Monday per PRD CA-07 */
        startDate: { type: Date, required: true },
        nextDeliveryDate: { type: Date, default: null, index: true },
        /** Mon-Fri or Full week */
        deliveryDays: {
            type: String,
            enum: ['mon_fri', 'full_week'],
            default: 'mon_fri'
        },
        deliverySlot: {
            type: String,
            enum: ['breakfast', 'lunch', 'dinner'],
            required: true
        },
        deliverySlots: {
            type: [String],
            enum: ['breakfast', 'lunch', 'dinner'],
            default: undefined
        },
        deliveryAddress: { type: deliveryAddressSchema, required: true },

        // ─── Pricing ──────────────────────────────────────────────────────────
        pricing: {
            basePricePerDay: { type: Number, required: true, min: 0 },
            deliveryFeePerDay: { type: Number, default: 0, min: 0 },
            foodVat: { type: Number, default: 0, min: 0 },
            deliveryVat: { type: Number, default: 0, min: 0 },
            platformFee: { type: Number, default: 0, min: 0 },
            foodVatAmount: { type: Number, default: 0 },
            deliveryVatAmount: { type: Number, default: 0 },
            platformFeeAmount: { type: Number, default: 0 },
            totalPerWeek: { type: Number, required: false, min: 0 },
            totalPrice: { type: Number, required: true, min: 0 },
            currency: { type: String, default: 'INR' }
        },

        // ─── Payment ──────────────────────────────────────────────────────────
        paymentMethod: {
            type: String,
            enum: ['razorpay', 'cash', 'wallet'],
            default: 'razorpay'
        },

        // ─── Skip Management (PRD ACM-13) ─────────────────────────────────────
        skipsUsedThisMonth: { type: Number, default: 0, min: 0 },
        maxSkipsPerMonth: { type: Number, default: 2, min: 0 },
        /** Year-month string for skip reset e.g. "2026-06" */
        skipsMonthKey: { type: String, default: '' },

        // ─── Pause Management (PRD ACM-14) ────────────────────────────────────
        pausedUntil: { type: Date, default: null },
        pauseReason: { type: String, default: '' },
        /** Max consecutive days vendor can be paused */
        maxPauseDays: { type: Number, default: 2 },

        // ─── Cancellation ─────────────────────────────────────────────────────
        cancelledAt: { type: Date, default: null },
        cancellationReason: { type: String, default: '' },

        // ─── Invoice Preference (PRD CA-V3-07) ────────────────────────────────
        invoiceType: {
            type: String,
            enum: ['receipt', 'b2b_vat'],
            default: 'receipt'
        },
        companyNip: { type: String, default: '' },
        companyName: { type: String, default: '' },
        billingEmail: { type: String, default: '' },

        autoRenew: { type: Boolean, default: true },
        billingCycleStart: { type: Date, default: null },

        /** Last delivery generated from this subscription */
        lastDeliveryDate: { type: Date, default: null }
    },
    {
        collection: 'dmb_subscriptions',
        timestamps: true
    }
);

// ─── Indexes ───────────────────────────────────────────────────────────────
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ vendorId: 1, status: 1 });
subscriptionSchema.index({ nextDeliveryDate: 1, status: 1 });
subscriptionSchema.index({ status: 1, autoRenew: 1 });

// ─── Pre-save: generate subscriptionId ──────────────────────────────────────
subscriptionSchema.pre('save', function (next) {
    if (!this.subscriptionId) {
        const ts = Date.now().toString().slice(-6);
        const rand = Math.floor(100 + Math.random() * 900);
        this.subscriptionId = `DMB-SUB-${ts}${rand}`;
    }
    next();
});

export const DMBSubscription = mongoose.model('DMBSubscription', subscriptionSchema);
