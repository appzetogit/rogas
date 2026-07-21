import mongoose from 'mongoose';

const officeOnboardingSchema = new mongoose.Schema(
    {
        accountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeAccount',
            required: true,
            index: true
        },
        email: {
            type: String,
            required: true,
            lowercase: true
        },
        currentStep: {
            type: String,
            enum: ['step1_profile', 'step2_docs', 'step3_final', 'completed'],
            default: 'step1_profile'
        },
        
        // Step 1: Company Profile
        companyName: { type: String, default: '' },
        address: { type: String, default: '' },
        nip: { type: String, default: '' },
        regon: { type: String, default: '' },
        
        // Step 2: Documents
        documents: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {}
        },
        
        // Step 3: Contact & Bank Details
        contactName: { type: String, default: '' },
        designation: { type: String, default: '' },
        contactEmail: { type: String, default: '' },
        phone: { type: String, default: '' },
        bankName: { type: String, default: '' },
        accountName: { type: String, default: '' },
        iban: { type: String, default: '' },
        
        isCompleted: {
            type: Boolean,
            default: false
        },
        completedAt: {
            type: Date
        }
    },
    {
        collection: 'office_onboarding',
        timestamps: true
    }
);

export const OfficeOnboarding = mongoose.model('OfficeOnboarding', officeOnboardingSchema);
