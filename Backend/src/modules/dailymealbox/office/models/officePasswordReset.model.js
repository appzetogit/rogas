import mongoose from 'mongoose';

/** One-time code for "Forgot password" in the Office panel (separate from the sign-up OTP so the two never clash). */
const officePasswordResetSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, lowercase: true, trim: true, unique: true },
        otpHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        attempts: { type: Number, default: 0 }
    },
    { collection: 'office_password_resets', timestamps: true }
);

officePasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OfficePasswordReset = mongoose.model('OfficePasswordReset', officePasswordResetSchema);
