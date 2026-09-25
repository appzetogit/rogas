import mongoose from 'mongoose';

const shiftChangeRequestSchema = new mongoose.Schema(
    {
        partnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            required: true,
            index: true
        },
        currentShifts: [{
            type: String,
        }],
        requestedShifts: [{
            type: String,
        }],
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true
        },
        reason: {
            type: String,
            default: ''
        },
        resolvedAt: {
            type: Date,
            default: null
        },
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null
        }
    },
    {
        collection: 'food_delivery_shift_requests',
        timestamps: true
    }
);

export const DeliveryShiftChangeRequest = mongoose.model('DeliveryShiftChangeRequest', shiftChangeRequestSchema);
