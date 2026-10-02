import mongoose from 'mongoose';

const deliverySlotSchema = new mongoose.Schema({
    // Immutable machine key stored on subscriptions/orders/batches (e.g. "lunch", "early_bird")
    key: { type: String, required: true, unique: true, trim: true, lowercase: true, immutable: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    icon: { type: String, default: '🍽️' },
    color: { type: String, default: '#f97316' },

    // Prep window for vendors (HH:MM, 24h)
    startTime: { type: String, required: true, default: '11:00' },
    endTime: { type: String, required: true, default: '15:00' },
    maxPrepMinutes: { type: Number, default: 60, min: 1 },

    // Customer-facing delivery window shown at checkout / tracking (optional, falls back to prep window)
    deliveryStartTime: { type: String, default: '' },
    deliveryEndTime: { type: String, default: '' },

    // How many hours before startTime the customer can no longer change/skip this slot (0 = no rule)
    orderCutoffHours: { type: Number, default: 0, min: 0 },

    // Days of week this slot is offered: 0=Sun … 6=Sat
    availableDays: { type: [Number], default: [1, 2, 3, 4, 5, 6, 0] },

    sortOrder: { type: Number, default: 0 },
    /** Kept in sync with `status`: true only while the slot is `active` (offered to new subscribers). */
    isEnabled: { type: Boolean, default: true },

    // ─── Amendment v2 Extra — Gap A lifecycle ─────────────────────────────────────────────────────────────
    /**
     * draft        created, not offered yet (admin activates manually)
     * active       offered to customers
     * deactivating no longer offered; existing subscribers keep deliveries until graceEndsAt, then move to fallbackSlotKey
     * disabled     switched off
     */
    status: { type: String, enum: ['draft', 'active', 'deactivating', 'disabled'], default: 'active', index: true },
    /** Cities the slot is offered in (AdminCity ids). Empty = every city. */
    cityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdminCity' }],
    /**
     * The driver shift that covers this slot: its own key (drivers list it in allowedShifts) or another slot's key
     * whose drivers also cover this one (e.g. "late_dinner" covered by the "dinner" shift). Never empty.
     */
    linkedShiftKey: { type: String, default: '', trim: true, lowercase: true },
    deactivatingAt: { type: Date, default: null },
    graceEndsAt: { type: Date, default: null },
    fallbackSlotKey: { type: String, default: '' },
    migratedAt: { type: Date, default: null }
}, {
    timestamps: true,
    collection: 'dmb_delivery_slots'
});

deliverySlotSchema.index({ sortOrder: 1, startTime: 1 });

export const DeliverySlot = mongoose.model('DeliverySlot', deliverySlotSchema);
