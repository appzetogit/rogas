import mongoose from 'mongoose';

const mealSlotSchema = new mongoose.Schema({
    startTime:       { type: String, default: '00:00' }, // "HH:MM" 24h
    endTime:         { type: String, default: '23:59' }, // "HH:MM" 24h
    maxPrepMinutes:  { type: Number, default: 60 },
    isEnabled:       { type: Boolean, default: true }
}, { _id: false });

const vendorTimingSettingsSchema = new mongoose.Schema({
    breakfast: { type: mealSlotSchema, default: () => ({ startTime: '04:00', endTime: '10:00', maxPrepMinutes: 60, isEnabled: true }) },
    lunch:     { type: mealSlotSchema, default: () => ({ startTime: '11:00', endTime: '15:00', maxPrepMinutes: 60, isEnabled: true }) },
    dinner:    { type: mealSlotSchema, default: () => ({ startTime: '17:00', endTime: '21:00', maxPrepMinutes: 90, isEnabled: true }) },
    mealChangeCutoffTime: { type: String, default: '20:00' },
    bypassPrepTimingRestrictions: { type: Boolean, default: false },
    isActive:  { type: Boolean, default: true }
}, {
    timestamps: true,
    collection: 'vendor_timing_settings'
});

export const VendorTimingSettings = mongoose.model('VendorTimingSettings', vendorTimingSettingsSchema);
