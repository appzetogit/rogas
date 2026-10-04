import mongoose from 'mongoose';

/**
 * DMBDailyOrder — One daily delivery instance per active subscription
 * Created when vendor's delivery day comes for a subscriber.
 * PRD Reference: CA-12 (Calendar), VM-03 (Vendor Orders), DA-02 (Driver Orders)
 */

const dmbDailyOrderSchema = new mongoose.Schema(
    {
        /** Human-readable order ID e.g. DMB-ORD-123456 */
        orderId: {
            type: String,
            unique: true,
            sparse: true,
            index: true
        },

        /**
         * subscription      — generated from a subscription (subscriptionId set)
         * one_time_select   — Select mode single meal, no subscription (Gap AG)
         * pre_order         — confirmed pre-order of a new meal launch (Gap M)
         */
        orderType: { type: String, enum: ['subscription', 'one_time_select', 'pre_order'], default: 'subscription', index: true },
        subscriptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBSubscription',
            required: function requiredForSubscriptionOrders() { return !this.orderType || this.orderType === 'subscription'; },
            index: true
        },
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null },

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true,
            index: true
        },

        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },

        /** Snapshot of meals for this day (from subscription.meals at time of creation) */
        meals: [
            {
                mealPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBMealPlan' },
                name: { type: String, default: '' },
                quantity: { type: Number, default: 1 },
                /** Family Box (Gap AF): whose set this is, e.g. "Person 1 — Keto Lunch". */
                memberLabel: { type: String, default: '' },
                /** Gap AL snapshot so the driver/customer screens need no extra lookup. */
                temperatureType: { type: String, enum: ['hot', 'cold', null], default: null }
            }
        ],
        /** Family Box: one stop, several labelled sets (DA-04 shows the set count). */
        isFamilyBox: { type: Boolean, default: false },
        setCount: { type: Number, default: 1, min: 1 },
        /** True when any meal in the order is a cold meal box (driver insulated-bag reminder). */
        hasColdMeal: { type: Boolean, default: false },

        /** The specific delivery date (date only, midnight UTC) */
        deliveryDate: {
            type: Date,
            required: true,
            index: true
        },

        deliverySlot: {
            type: String,
            required: true
        },

        /**
         * Order lifecycle status
         * scheduled → preparing → ready → out_for_delivery → delivered
         */
        status: {
            type: String,
            enum: ['scheduled', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'skipped', 'failed'],
            default: 'scheduled',
            index: true
        },

        /** Collection PIN for driver to verify pickup from vendor */
        collectionPin: { type: String, default: '' },
        deliveryPin: { type: String, default: '' },

        pricing: {
            foodCost: { type: Number, default: 0 },
            foodVat: { type: Number, default: 0 },
            foodVatAmount: { type: Number, default: 0 },
            deliveryFee: { type: Number, default: 0 },
            deliveryVat: { type: Number, default: 0 },
            deliveryVatAmount: { type: Number, default: 0 },
            platformFee: { type: Number, default: 0 },
            totalPrice: { type: Number, default: 0 },
            currency: { type: String, default: 'PLN' } // fallback only — always set explicitly at creation
        },

        deliveryAddress: {
            street: { type: String, default: '' },
            city: { type: String, default: '' },
            state: { type: String, default: '' },
            label: { type: String, default: 'Home' },
            location: {
                type: { type: String, enum: ['Point'], default: 'Point' },
                coordinates: { type: [Number], default: undefined }
            }
        },

        dispatch: {
            deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null }
        },

        /** Timestamps for status transitions (for analytics & SLA tracking) */
        preparingAt: { type: Date, default: null },
        readyAt: { type: Date, default: null },
        pickedUpAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null },

        /**
         * Separated ratings (Gap R): meal quality feeds the vendor, delivery experience feeds the driver, overall feeds
         * platform analytics. `deliveryRating` is kept for older screens and mirrors deliveryExperience (or the single
         * overall rating when ACM-159 is off).
         */
        ratings: {
            mealQuality: { type: Number, default: null, min: 1, max: 5 },
            deliveryExperience: { type: Number, default: null, min: 1, max: 5 },
            overall: { type: Number, default: null, min: 1, max: 5 }
        },
        ratedAt: { type: Date, default: null },
        /** Vendor's public reply to the review (Gap T). Editable for 24h, never deletable by the vendor. */
        vendorResponse: {
            text: { type: String, default: '' },
            createdAt: { type: Date, default: null },
            editedAt: { type: Date, default: null },
            hidden: { type: Boolean, default: false },
            hiddenReason: { type: String, default: '' },
            hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
            hiddenAt: { type: Date, default: null }
        },
        /** Customer rating for the delivery (1-5 stars) */
        deliveryRating: { type: Number, default: null, min: 1, max: 5 },
        /** Customer feedback text */
        ratingFeedback: { type: String, default: '' },
        /** Tip amount given to driver */
        driverTip: { type: Number, default: 0, min: 0 },
        /** Whether rating has been submitted */
        isRated: { type: Boolean, default: false },

        /** Payment and Earnings tracking */
        riderEarning: { type: Number, default: 0 },
        paymentMethod: { type: String, enum: ['CASH', 'ONLINE', 'QR', ''], default: '' },
        paymentConfirmed: { type: Boolean, default: false },

        notes: { type: String, default: '' },

        /** Customer note to the kitchen + the vendor's acknowledgement (Amendment 1 #7). Preparing is blocked until acknowledged. */
        /** Where the driver confirmed the delivery, and whether that was > 500 m from the address (flag for admin review). */
        deliveryGps: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
        gpsMismatch: { type: Boolean, default: false },
        proofMethod: { type: String, default: '' },
        /** Set when the customer's account was deleted (GDPR): the order stays for tax law, without personal data. */
        anonymisedAs: { type: String, default: '' },
        specialInstructions: { type: String, default: '' },
        specialInstructionsAllergen: { type: Boolean, default: false },
        specialInstructionsAckAt: { type: Date, default: null },
        specialInstructionsAckBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', default: null },

        /** One-off address for this delivery only (Gap V) — the subscription's day assignment is unchanged. */
        addressOverridden: { type: Boolean, default: false },
        /** Failed delivery report (DA-07) incl. what happened to the box (Gap P). */
        failure: {
            reason: { type: String, default: '' },
            disposition: { type: String, enum: ['held_by_driver', 'returned_to_vendor', 'left_with_neighbour', 'returned_to_shop', ''], default: '' },
            note: { type: String, default: '' },
            photoUrl: { type: String, default: '' },
            reportedAt: { type: Date, default: null },
            reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null }
        },
        /** Select mode → subscription conversion tracking (Gap AG). */
        conversionPromptSentAt: { type: Date, default: null },
        convertedToSubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBSubscription', default: null },
        /** Payment for orders not paid through a subscription (Select mode, pre-orders). */
        paymentStatus: { type: String, enum: ['not_required', 'pending', 'paid', 'failed', 'refunded'], default: 'not_required' },
        paymentTransactionId: { type: String, default: '' }
    },
    {
        collection: 'dmb_daily_orders',
        timestamps: true
    }
);

// ─── Indexes ────────────────────────────────────────────────────────────────
dmbDailyOrderSchema.index({ userId: 1, deliveryDate: 1 });
dmbDailyOrderSchema.index({ vendorId: 1, deliveryDate: 1, status: 1 });
// One order per subscription/day/slot. Partial so Select-mode and pre-order rows (no subscription) never collide.
dmbDailyOrderSchema.index(
    { subscriptionId: 1, deliveryDate: 1, deliverySlot: 1 },
    { unique: true, partialFilterExpression: { subscriptionId: { $type: 'objectId' } }, name: 'subscription_day_slot_unique' }
);
dmbDailyOrderSchema.index({ vendorId: 1, 'ratings.mealQuality': 1, ratedAt: -1 });

// ─── Pre-save: generate orderId and deliveryPin ──────────────────────────────
dmbDailyOrderSchema.pre('save', function (next) {
    if (!this.orderId) {
        const ts = Date.now().toString().slice(-6);
        const rand = Math.floor(100 + Math.random() * 900);
        this.orderId = `DMB-ORD-${ts}${rand}`;
    }
    if (!this.deliveryPin) {
        this.deliveryPin = String(Math.floor(1000 + Math.random() * 9000));
    }
    next();
});

export const DMBDailyOrder = mongoose.model('DMBDailyOrder', dmbDailyOrderSchema);

const foodDeliveryTipTransactionSchema = new mongoose.Schema(
    {
        deliveryPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            required: true,
            index: true
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBDailyOrder',
            required: true,
            index: true
        },
        orderType: {
            type: String,
            enum: ['subscription', 'one-time'],
            default: 'subscription'
        },
        amount: {
            type: Number,
            required: true,
            min: 0.01
        },
        razorpayOrderId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        razorpayPaymentId: {
            type: String,
            default: ''
        },
        razorpaySignature: {
            type: String,
            default: ''
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed'],
            default: 'pending',
            index: true
        }
    },
    {
        collection: 'food_delivery_tip_transactions',
        timestamps: true
    }
);

export const FoodDeliveryTipTransaction = mongoose.model('FoodDeliveryTipTransaction', foodDeliveryTipTransactionSchema);
