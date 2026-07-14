import mongoose from 'mongoose';

const officeEmployeeSchema = new mongoose.Schema(
    {
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        phone: {
            type: String,
            trim: true
        },
        department: {
            type: String,
            trim: true
        },
        budget: {
            type: Number,
            default: 0
        },
        preferredSlot: {
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: ['Active', 'Paused'],
            default: 'Active'
        },
        profileImage: {
            type: String,
            default: ''
        }
    },
    {
        collection: 'office_employees',
        timestamps: true
    }
);

export const OfficeEmployee = mongoose.model('OfficeEmployee', officeEmployeeSchema);
