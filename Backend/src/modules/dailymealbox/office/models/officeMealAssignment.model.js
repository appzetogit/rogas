import mongoose from 'mongoose';

/**
 * One meal subscription an office bought for one employee. An employee can hold several at once (e.g. breakfast from
 * one vendor and lunch from another, or next month's lunch bought before this month's ends); each purchase adds new
 * rows and never replaces earlier ones. Older rows (before multiple subscriptions) have no officePaymentId.
 */
const officeMealAssignmentSchema = new mongoose.Schema(
    {
        accountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeAccount',
            required: true,
            index: true
        },
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeCompany',
            default: null
        },
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeEmployee',
            required: true,
            index: true
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        mealPlanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBMealPlan',
            required: true,
            index: true
        },
        subscriptionPlanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VendorSubscriptionPlan',
            default: null
        },
        subscriptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBSubscription'
        },
        /** The office purchase this assignment came from. */
        officePaymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficePayment',
            default: null
        },
        mealSlots: {
            type: [String],
            required: true
        },
        status: {
            type: String,
            enum: ['active', 'paused', 'cancelled', 'expired'],
            default: 'active'
        },
        /** Last day covered (inclusive) — the subscription ends the day after. */
        validUntil: {
            type: Date
        },
        assignedAt: {
            type: Date,
            default: Date.now
        },
        startDate: {
            type: Date,
            default: Date.now
        },
        cancelledAt: { type: Date, default: null },
        cancelReason: { type: String, default: '' }
    },
    {
        collection: 'office_meal_assignments',
        timestamps: true
    }
);

// A purchase assigns each of its employees once, even if the payment confirmation runs twice.
officeMealAssignmentSchema.index(
    { officePaymentId: 1, employeeId: 1 },
    { unique: true, partialFilterExpression: { officePaymentId: { $type: 'objectId' } }, name: 'office_payment_employee_unique' }
);

export const OfficeMealAssignment = mongoose.model('OfficeMealAssignment', officeMealAssignmentSchema);
