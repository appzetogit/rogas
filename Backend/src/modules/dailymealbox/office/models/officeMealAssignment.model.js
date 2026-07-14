import mongoose from 'mongoose';

const officeMealAssignmentSchema = new mongoose.Schema(
    {
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
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
        mealSlot: {
            type: String,
            enum: ['breakfast', 'lunch', 'dinner'],
            required: true
        },
        status: {
            type: String,
            enum: ['Active', 'Paused', 'Cancelled'],
            default: 'Active'
        },
        validUntil: {
            type: Date
        }
    },
    {
        collection: 'office_meal_assignments',
        timestamps: true
    }
);

export const OfficeMealAssignment = mongoose.model('OfficeMealAssignment', officeMealAssignmentSchema);
