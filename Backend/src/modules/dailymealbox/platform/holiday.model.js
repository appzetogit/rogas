import mongoose from 'mongoose';

/** AP-08 Business holiday / platform closure (Gap G). `date` is the storage form of a local calendar date (UTC midnight). */
const holidaySchema = new mongoose.Schema(
    {
        date: { type: Date, required: true, index: true },
        name: { type: String, required: true, trim: true },
        scope: { type: String, enum: ['all', 'city'], default: 'all' },
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminCity', default: null, index: true },
        icon: { type: String, default: '🎄' },
        autoImported: { type: Boolean, default: false },
        status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending', index: true },
        confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        confirmedAt: { type: Date, default: null },
        /** When subscriptions were extended / orders and shifts cleared for this date. */
        appliedAt: { type: Date, default: null },
        affectedSubscriptions: { type: Number, default: 0 },
        notified7At: { type: Date, default: null },
        notified3At: { type: Date, default: null }
    },
    { collection: 'dmb_platform_holidays', timestamps: true }
);
holidaySchema.index({ date: 1, scope: 1, cityId: 1 }, { unique: true });

export const DMBPlatformHoliday = mongoose.model('DMBPlatformHoliday', holidaySchema);
