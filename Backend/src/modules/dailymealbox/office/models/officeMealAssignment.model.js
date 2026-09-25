import mongoose from 'mongoose';

const officeMealAssignmentSchema = new mongoose.Schema(
    {
        accountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeAccount',
            required: true,
            index: true
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
        subscriptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBSubscription'
        },
        mealSlots: {
            type: [String],
            required: true
        },
        status: {
            type: String,
            enum: ['active', 'paused', 'cancelled'],
            default: 'active'
        },
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
        }

    },
    {
        collection: 'office_meal_assignments',
        timestamps: true
    }
);

export const OfficeMealAssignment = mongoose.model('OfficeMealAssignment', officeMealAssignmentSchema);
