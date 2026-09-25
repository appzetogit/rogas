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

        subscriptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBSubscription',
            required: true,
            index: true
        },

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
                quantity: { type: Number, default: 1 }
            }
        ],

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
            currency: { type: String, default: 'INR' }
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

        notes: { type: String, default: '' }
    },
    {
        collection: 'dmb_daily_orders',
        timestamps: true
    }
);

// ─── Indexes ────────────────────────────────────────────────────────────────
dmbDailyOrderSchema.index({ userId: 1, deliveryDate: 1 });
dmbDailyOrderSchema.index({ vendorId: 1, deliveryDate: 1, status: 1 });
dmbDailyOrderSchema.index({ subscriptionId: 1, deliveryDate: 1, deliverySlot: 1 }, { unique: true });

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
