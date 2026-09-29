import mongoose from 'mongoose';

/**
 * One row per (driver, calendar date, delivery slot) — the driver's expected shift for that
 * slot on that day, generated ahead of time from FoodDeliveryPartner.allowedShifts x DeliverySlot.availableDays.
 * PRD Reference: Amendment v2, GAP B (Driver Attendance Tracking), GAP Z (Availability Confirmation).
 */
const shiftRecordSchema = new mongoose.Schema(
    {
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', required: true, index: true },
        /** Calendar date this shift falls on, normalised to 00:00 UTC. */
        date: { type: Date, required: true, index: true },
        /** DeliverySlot.key this shift covers (e.g. "lunch", "dinner"). */
        slotKey: { type: String, required: true, trim: true, lowercase: true },

        status: {
            type: String,
            enum: ['scheduled', 'confirmed', 'completed', 'no_show'],
            default: 'scheduled',
            index: true
        },

        /** Driver tapped "I'll be there" (GAP Z), ideally 24h ahead. */
        confirmedAt: { type: Date, default: null },
        /** Set the moment the driver goes online during the slot's window — doubles as check-in. */
        checkedInAt: { type: Date, default: null },
        /** Set once the slot's window has closed, alongside status becoming 'completed'. */
        checkedOutAt: { type: Date, default: null },
        /** Snapshot of driver.earningsToday when the shift was finalised, for the driver's own history view. */
        earnings: { type: Number, default: 0, min: 0 },

        /** Guards the "2h before shift, not yet confirmed" admin alert from firing more than once. */
        unconfirmedAlertSentAt: { type: Date, default: null }
    },
    {
        collection: 'food_shift_records',
        timestamps: true
    }
);

shiftRecordSchema.index({ driverId: 1, date: 1, slotKey: 1 }, { unique: true });
shiftRecordSchema.index({ date: 1, status: 1 });

export const ShiftRecord = mongoose.model('ShiftRecord', shiftRecordSchema);
