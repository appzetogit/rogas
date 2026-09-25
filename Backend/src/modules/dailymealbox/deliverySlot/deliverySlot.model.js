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
    isEnabled: { type: Boolean, default: true }
}, {
    timestamps: true,
    collection: 'dmb_delivery_slots'
});

deliverySlotSchema.index({ sortOrder: 1, startTime: 1 });

export const DeliverySlot = mongoose.model('DeliverySlot', deliverySlotSchema);
