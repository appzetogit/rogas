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
            enum: ['breakfast', 'lunch', 'dinner'],
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

        pricing: {
            totalPrice: { type: Number, default: 0 },
            currency: { type: String, default: 'INR' }
        },

        deliveryAddress: {
            street: { type: String, default: '' },
            city: { type: String, default: '' },
            state: { type: String, default: '' },
            label: { type: String, default: 'Home' }
        },

        /** Timestamps for status transitions (for analytics & SLA tracking) */
        preparingAt: { type: Date, default: null },
        readyAt: { type: Date, default: null },
        pickedUpAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null },

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
dmbDailyOrderSchema.index({ subscriptionId: 1, deliveryDate: 1 });

// ─── Pre-save: generate orderId ──────────────────────────────────────────────
dmbDailyOrderSchema.pre('save', function (next) {
    if (!this.orderId) {
        const ts = Date.now().toString().slice(-6);
        const rand = Math.floor(100 + Math.random() * 900);
        this.orderId = `DMB-ORD-${ts}${rand}`;
    }
    next();
});

export const DMBDailyOrder = mongoose.model('DMBDailyOrder', dmbDailyOrderSchema);
