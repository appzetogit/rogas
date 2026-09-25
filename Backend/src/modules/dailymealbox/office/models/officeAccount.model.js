import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const officeAccountSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ['active', 'blocked'],
            default: 'active'
        },
        // Language chosen by the office admin (admin-managed language code). null = default language.
        languagePreference: {
            type: String,
            default: null,
            trim: true,
            lowercase: true
        },
        // A link to the company once onboarding is completed (or created)        // A link to the company once onboarding is completed (or created)
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeCompany'
        }
    },
    {
        collection: 'office_accounts',
        timestamps: true
    }
);

officeAccountSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

officeAccountSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

export const OfficeAccount = mongoose.model('OfficeAccount', officeAccountSchema);
