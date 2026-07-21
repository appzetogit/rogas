import mongoose from 'mongoose';

const officeCompanySchema = new mongoose.Schema(
    {
        accountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeAccount',
            required: true,
            index: true
        },
        legalName: {
            type: String,
            required: true,
            trim: true
        },
        nip: {
            type: String,
            required: true,
            trim: true
        },
        regon: {
            type: String,
            trim: true
        },
        registeredAddress: {
            type: String,
            required: true
        },
        deliveryAddress: {
            type: String,
            required: true
        },
        location: {
            lat: { type: Number },
            lng: { type: Number }
        },
        planType: {
            type: String,
            default: 'Standard'
        },
        billingCycle: {
            type: String,
            default: 'Monthly'
        },
        paymentMethod: {
            type: String,
            default: 'Bank Transfer'
        },
        monthlyBudgetCap: {
            type: Number,
            default: 10000
        },
        budgetUtilized: {
            type: Number,
            default: 0
        },
        contractStartDate: {
            type: Date,
            default: Date.now
        },
        contactName: {
            type: String,
            required: true
        },
        contactRole: {
            type: String,
            required: true
        },
        contactEmail: {
            type: String,
            required: true,
            lowercase: true
        },
        contactPhone: {
            type: String,
            required: true
        },
        totalEmployees: {
            type: Number,
            default: 0
        },
        activeVendorsCount: {
            type: Number,
            default: 0
        },
        bankName: {
            type: String,
            trim: true
        },
        accountName: {
            type: String,
            trim: true
        },
        iban: {
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: ['under_review', 'approved', 'rejected'],
            default: 'under_review',
            index: true
        }
    },
    {
        collection: 'office_companies',
        timestamps: true
    }
);

export const OfficeCompany = mongoose.model('OfficeCompany', officeCompanySchema);
