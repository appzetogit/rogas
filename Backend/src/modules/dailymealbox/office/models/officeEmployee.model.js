import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const officeEmployeeSchema = new mongoose.Schema(
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
        companyNip: { type: String, default: '' },
        companyName: { type: String, default: '' },
        registeredAddress: { type: String, default: '' },
        deliveryAddress: { type: String, default: '' },
        billingEmail: { type: String, default: '' },
        /** Linked FoodUser._id — set when employee is created */
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            default: null,
            index: true
        },
        employeeId: {
            type: String,
            unique: true,
            sparse: true,
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
        status: {
            type: String,
            enum: ['Active', 'Paused'],
            default: 'Active'
        },
        profileImage: {
            type: String,
            default: ''
        },
        assignedVendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            default: null
        },
        assignedMealPlanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBMealPlan',
            default: null
        },
        deliverySlot: {
            type: String,
            default: ''
        },
        subscriptionStatus: {
            type: String,
            enum: ['active', 'paused', 'cancelled', 'none'],
            default: 'none'
        },
        /** Temporary plain-text password — sent to employee, cleared after first login */
        tempPassword: {
            type: String,
            default: ''
        }
    },
    {
        collection: 'office_employees',
        timestamps: true
    }
);

// Compound index to ensure email is unique per office account/company
officeEmployeeSchema.index({ accountId: 1, email: 1 }, { unique: true });

// Pre-save to auto-generate employeeId
officeEmployeeSchema.pre('save', function (next) {
    if (!this.employeeId) {
        const rand = Math.floor(1000 + Math.random() * 9000);
        this.employeeId = `EMP-${rand}`;
    }
    next();
});

export const OfficeEmployee = mongoose.model('OfficeEmployee', officeEmployeeSchema);
