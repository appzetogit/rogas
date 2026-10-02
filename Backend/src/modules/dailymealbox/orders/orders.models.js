import mongoose from 'mongoose';

/**
 * Live stock per meal per day (Gap E). `available` = portions the vendor will make that day (defaults to the meal's
 * capacity), `prepared` = portions already cooked (the vendor counts up while cooking). Sold out when either the
 * cooked count or the committed orders reach `available`.
 */
const mealStockSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        mealPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBMealPlan', required: true },
        date: { type: Date, required: true },
        available: { type: Number, required: true, min: 0 },
        prepared: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['open', 'sold_out'], default: 'open' },
        soldOutAt: { type: Date, default: null },
        lowStockAlertedAt: { type: Date, default: null }
    },
    { collection: 'dmb_meal_stock', timestamps: true }
);
mealStockSchema.index({ mealPlanId: 1, date: 1 }, { unique: true });
mealStockSchema.index({ date: 1, vendorId: 1 });
export const DMBMealStock = mongoose.model('DMBMealStock', mealStockSchema);

const addressSnapshot = new mongoose.Schema(
    {
        label: String, customLabel: String, street: String, additionalDetails: String, city: String, state: String,
        zipCode: String, phone: String, addressId: mongoose.Schema.Types.ObjectId, zoneId: mongoose.Schema.Types.ObjectId,
        location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: undefined } }
    },
    { _id: false }
);

/**
 * A one-off purchase that becomes a DMBDailyOrder once paid:
 *   select     Select mode — one meal today/tomorrow, no subscription (Gap AG). Paid at checkout.
 *   pre_order  Reservation of a new meal launch (Gap M). Nothing is charged until launch day.
 */
const oneTimeOrderSchema = new mongoose.Schema(
    {
        ref: { type: String, unique: true, index: true },
        type: { type: String, enum: ['select', 'pre_order'], required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true, index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        mealPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBMealPlan', required: true, index: true },
        quantity: { type: Number, default: 1, min: 1, max: 10 },
        deliveryDate: { type: Date, required: true, index: true },
        deliverySlot: { type: String, required: true },
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null },
        deliveryAddress: { type: addressSnapshot, required: true },
        pricing: {
            foodCost: Number, foodVat: Number, foodVatAmount: Number, deliveryFee: Number, deliveryVat: Number,
            deliveryVatAmount: Number, platformFee: { type: Number, default: 0 }, totalPrice: Number, currency: String
        },
        /**
         * select:    pending_payment → paid (daily order created) | cancelled | failed
         * pre_order: reserved → payment_pending (launch day, wallet too low) → paid | cancelled | failed
         */
        status: { type: String, enum: ['reserved', 'pending_payment', 'payment_pending', 'paid', 'cancelled', 'failed'], default: 'pending_payment', index: true },
        paymentTransactionId: { type: String, default: '' },
        paidWith: { type: String, enum: ['', 'online', 'wallet'], default: '' },
        dailyOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBDailyOrder', default: null },
        cancelReason: { type: String, default: '' },
        launchProcessedAt: { type: Date, default: null }
    },
    { collection: 'dmb_one_time_orders', timestamps: true }
);
oneTimeOrderSchema.pre('save', function setRef(next) {
    if (!this.ref) this.ref = `${this.type === 'pre_order' ? 'PRE' : 'SEL'}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
    next();
});
export const DMBOneTimeOrder = mongoose.model('DMBOneTimeOrder', oneTimeOrderSchema);
