import mongoose from 'mongoose';

/**
 * OfficePayment — Records every payment made by an office account
 * for meal subscription assignments (via Razorpay or mock/dev).
 */
const officePaymentSchema = new mongoose.Schema(
    {
        accountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeAccount',
            required: true,
            index: true
        },
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeCompany'
        },
        /** Razorpay order id (or mock_order_xxx in dev) */
        razorpayOrderId: {
            type: String,
            required: true,
            index: true
        },
        /** Razorpay payment id after success */
        razorpayPaymentId: {
            type: String,
            default: null
        },
        razorpaySignature: {
            type: String,
            default: null
        },
        /** The VendorSubscriptionPlan selected */
        subscriptionPlanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VendorSubscriptionPlan',
            default: null
        },
        /** Meal plan and start date to assign once the payment is confirmed. */
        mealPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBMealPlan', default: null },
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        planType: { type: String, default: '' },
        /**
         * The server quote ONE employee's subscription was priced at (the same quote a customer subscription uses):
         * every subscription created for this payment is built from it, so its daily orders cost what was paid.
         */
        quote: { type: mongoose.Schema.Types.Mixed, default: undefined },
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null },
        /** Where the meals go: the company's delivery address and map pin when the order was placed. */
        deliveryAddress: { type: mongoose.Schema.Types.Mixed, default: undefined },
        /** Set while the employees' subscriptions are being created (stops two confirmations running at once). */
        fulfillingAt: { type: Date, default: null },
        /** Employees who could not be given their meals (e.g. removed before the payment was confirmed). */
        skippedEmployees: {
            type: [{ employeeId: mongoose.Schema.Types.ObjectId, name: String, reason: String, _id: false }],
            default: undefined
        },
        /** publicId of the payment_transactions row that pays for this order (any provider). */
        paymentTransactionId: { type: String, default: '', index: true },
        provider: { type: String, default: '' },
        /** Set once the employees' assignments have been created. */
        fulfilledAt: { type: Date, default: null },
        /** Vendor assigned */
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            default: null
        },
        /** Employee IDs covered by this payment */
        employeeIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'OfficeEmployee'
            }
        ],
        slots: [{ type: String }],
        /** Amount in major units of `currency` (not paise/grosze) */
        amount: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: 'PLN' // fallback only — always set explicitly at creation
        },
        status: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded'],
            default: 'pending'
        },
        /** Whether this was a mock/dev bypass */
        isMock: {
            type: Boolean,
            default: false
        },
        /** Price breakdown snapshot */
        breakdown: {
            foodTotal: { type: Number, default: 0 },
            foodVat: { type: Number, default: 0 },
            delivery: { type: Number, default: 0 },
            deliveryVat: { type: Number, default: 0 },
            platformFee: { type: Number, default: 0 },
            discount: { type: Number, default: 0 }
        }
    },
    { timestamps: true }
);

export const OfficePayment = mongoose.model('OfficePayment', officePaymentSchema);
