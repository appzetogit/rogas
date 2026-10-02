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
        },
        customLabel: { type: String, default: '', trim: true },
        /** The customer's saved address this snapshot came from — edits to it propagate (Gap V). */
        addressId: { type: mongoose.Schema.Types.ObjectId, default: null },
        zoneId: { type: mongoose.Schema.Types.ObjectId, default: null }
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
        endDate: { type: Date, default: null },
        nextDeliveryDate: { type: Date, default: null, index: true },
        /** Mon-Fri, Full week, or specific days (Gap Q — deliveryDaysList) */
        deliveryDays: {
            type: String,
            enum: ['mon_fri', 'full_week', 'custom'],
            default: 'mon_fri'
        },
        /** JS weekdays (0=Sun … 6=Sat) when deliveryDays = 'custom' (ACM-146). */
        deliveryDaysList: { type: [Number], default: undefined },
        /** Fortnightly plans deliver in alternate weeks (Gap L). */
        deliveryPattern: { type: String, enum: ['every_week', 'alternate_weeks'], default: 'every_week' },
        /** Billing cycle of this period: one_day | weekly | fortnightly | monthly | annual (Gaps C, L). */
        billingCycle: { type: String, enum: ['one_day', 'weekly', 'fortnightly', 'monthly', 'annual', null], default: null },
        subscriptionPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorSubscriptionPlan', default: null },
        /**
         * Per-day slots (ACM-147): { "1": ["lunch"], "2": ["dinner"] } — weekday → slot keys. When set, every delivery
         * day must have an entry. daySlotKeys is maintained automatically for queries.
         */
        daySlots: { type: mongoose.Schema.Types.Mixed, default: undefined },
        daySlotKeys: { type: [String], default: undefined, index: true },
        /** Per-day delivery addresses (Gap V): Mon/Wed/Fri → Home, Tue/Thu → Office. */
        dayAddresses: {
            type: [{ day: { type: Number, min: 0, max: 6 }, addressId: { type: mongoose.Schema.Types.ObjectId, default: null }, address: deliveryAddressSchema, _id: false }],
            default: undefined
        },
        deliverySlot: {
            type: String,
            required: true
        },
        deliverySlots: {
            type: [String],
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
            applyFoodVatOnMenu: { type: Boolean, default: false },
            totalPerWeek: { type: Number, required: false, min: 0 },
            totalPrice: { type: Number, required: true, min: 0 },
            currency: { type: String, default: 'PLN' } // fallback only — always set explicitly at creation
        },

        // ─── Payment ──────────────────────────────────────────────────────────
        paymentMethod: {
            type: String,
            enum: ['razorpay', 'przelewy24', 'stripe', 'cash', 'wallet'],
            default: 'razorpay'
        },

        // ─── Skip Management (PRD ACM-13) ─────────────────────────────────────
        skipsUsedThisMonth: { type: Number, default: 0, min: 0 },
        maxSkipsPerMonth: { type: Number, default: 2, min: 0 },
        /** Year-month string for skip reset e.g. "2026-06" */
        skipsMonthKey: { type: String, default: '' },

        // ─── Pause Management (PRD ACM-14) ────────────────────────────────────
        pausedUntil: { type: Date, default: null },
        pausedAt: { type: Date, default: null },
        requestedPauseDays: { type: Number, default: 0 },
        pauseReason: { type: String, default: '' },
        /** Max consecutive days vendor can be paused */
        maxPauseDays: { type: Number, default: 2 },
        /** End date before the current pause moved it (to give days back on an early resume). */
        pauseOriginalEndDate: { type: Date, default: null },

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
        lastDeliveryDate: { type: Date, default: null },

        // ─── Amendment v2 Extra ───────────────────────────────────────────────
        /** dedicated = one maker; rotation = Smart Rotation across 2–5 makers (Gap AK). */
        subscriptionType: { type: String, enum: ['dedicated', 'rotation'], default: 'dedicated', index: true },
        /** Smart Rotation schedule: each weekday belongs to exactly one maker. */
        rotation: {
            type: [{
                vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true },
                mealPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBMealPlan', required: true },
                quantity: { type: Number, default: 1, min: 1 },
                days: { type: [Number], default: [] },
                pricePerDay: { type: Number, default: 0 },
                _id: false
            }],
            default: undefined
        },
        /** Every maker this subscription orders from (vendorId + rotation makers) — for vendor-side queries. */
        vendorIds: { type: [mongoose.Schema.Types.ObjectId], default: undefined, index: true },
        /** Family Box (Gap AF): one subscription, 2–4 people, one address, one drop. */
        familyBox: {
            enabled: { type: Boolean, default: false },
            members: {
                type: [{
                    label: { type: String, trim: true, required: true },
                    meals: [{ mealPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBMealPlan' }, quantity: { type: Number, default: 1, min: 1 }, _id: false }],
                    slots: { type: [String], default: [] },
                    _id: false
                }],
                default: undefined
            }
        },
        /** Discounts applied to this period (kept so each daily order is priced exactly like the quote). */
        isTrial: { type: Boolean, default: false, index: true },
        trialDiscountPct: { type: Number, default: 0 },
        trialEndsAt: { type: Date, default: null },
        annualDiscountPct: { type: Number, default: 0 },
        familyDiscountPct: { type: Number, default: 0 },
        /** Server-side quote this subscription was sold at (line items, totals, per-delivery prices). */
        quote: { type: mongoose.Schema.Types.Mixed, default: undefined },

        /** Plan changes (Gap S). */
        cancelAt: { type: Date, default: null },
        changeType: { type: String, enum: ['upgrade', 'downgrade', 'change_plan', 'switch_vendor', 'add_slot', 'renew', null], default: null },
        /** Rotation edited by the customer, applied from the next period (Gap AK). */
        pendingRotation: { type: mongoose.Schema.Types.Mixed, default: undefined },
        pendingRotationFrom: { type: Date, default: null },
        replacesSubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBSubscription', default: null },
        replacedBySubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBSubscription', default: null },
        renewsSubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBSubscription', default: null },
        renewedBySubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBSubscription', default: null },
        planChangePending: {
            changeType: { type: String, default: null },
            newSubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBSubscription', default: null },
            effectiveDate: { type: Date, default: null },
            creditAmount: { type: Number, default: 0 }
        },
        userPreferencesCarryOver: { type: Boolean, default: true },

        /** Slot discontinued by the admin (Gap A) — the customer must pick a new one. */
        needsSlotChange: { type: Boolean, default: false, index: true },
        slotChangeKeys: { type: [String], default: undefined },
        /** Delivery days added because a platform holiday removed one (Gap G). */
        holidayExtensions: { type: Number, default: 0 },
        /** Address moved outside the maker's zone (Gap U). */
        zoneMismatch: {
            detected: { type: Boolean, default: false },
            at: { type: Date, default: null },
            newZoneId: { type: mongoose.Schema.Types.ObjectId, default: null }
        },
        renewalReminderSentAt: { type: Date, default: null },
        expiredAt: { type: Date, default: null },

        // ─── Office / B2B Fields ──────────────────────────────────────────────
        /** Source of subscription: 'customer' (self-purchased) or 'office' (B2B assigned) */
        source: {
            type: String,
            enum: ['customer', 'office'],
            default: 'customer'
        },
        /** Office Company that assigned this subscription */
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeCompany',
            default: null
        }
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

// ─── Pre-save: generate subscriptionId, keep query helpers in sync ───────────
subscriptionSchema.pre('save', function (next) {
    const daySlots = this.daySlots && typeof this.daySlots === 'object' ? this.daySlots : null;
    const keys = daySlots ? [...new Set(Object.values(daySlots).flat().filter(Boolean))] : [];
    this.daySlotKeys = keys.length ? keys : undefined;
    const vendorIds = [this.vendorId, ...((this.rotation || []).map((r) => r.vendorId))].filter(Boolean).map(String);
    this.vendorIds = [...new Set(vendorIds)].map((id) => new mongoose.Types.ObjectId(id));
    if (!this.subscriptionId) {
        const ts = Date.now().toString().slice(-6);
        const rand = Math.floor(100 + Math.random() * 900);
        this.subscriptionId = `DMB-SUB-${ts}${rand}`;
    }
    next();
});

export const DMBSubscription = mongoose.model('DMBSubscription', subscriptionSchema);
