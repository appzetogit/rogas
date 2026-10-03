import mongoose from 'mongoose';

const officeOtpSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true
        },
        otp: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Date,
            required: true
        },
        attempts: {
            type: Number,
            default: 0
        }
    },
    {
        collection: 'office_sign_up_otps',
        timestamps: true
    }
);

officeOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OfficeOtp = mongoose.model('OfficeOtp', officeOtpSchema);
