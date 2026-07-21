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
        /** Amount in INR (not paise) */
        amount: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: 'INR'
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
            deliveryVat: { type: Number, default: 0 },
            platformFee: { type: Number, default: 0 }
        }
    },
    { timestamps: true }
);

export const OfficePayment = mongoose.model('OfficePayment', officePaymentSchema);
