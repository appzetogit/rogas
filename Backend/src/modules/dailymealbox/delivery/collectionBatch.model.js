import mongoose from 'mongoose';

/**
 * CollectionBatch — Driver pickup from vendor with PIN verification
 * CRITICAL: Creates verified chain of custody between vendor and driver
 * PRD Reference: VM-05 (Preparation Board), DA-05 (Vendor Pickup)
 * 
 * Flow: Vendor marks ready → PIN generated → FCM to driver → Driver enters PIN → Collected
 */
const collectionBatchSchema = new mongoose.Schema(
    {
        /** Human-readable batch ID */
        batchId: {
            type: String,
            unique: true,
            sparse: true,
            index: true
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            default: null,
            index: true
        },
        fleetPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FleetPartner',
            default: null
        },

        deliveryDate: { type: Date, required: true, index: true },
        deliverySlot: {
            type: String,
            required: true
        },

        /**
         * 4-digit collection PIN — stored in Redis (2h TTL) for fast lookup
         * Also stored here for admin audit trail (hashed)
         * Redis key: collection_pin:{batchId}
         */
        collectionPinHash: { type: String, default: '' },
        pinExpiry: { type: Date, default: null },
        pinVerified: { type: Boolean, default: false, index: true },
        pinAttempts: { type: Number, default: 0, min: 0 },
        /** Admin alerted after 3 failed PIN attempts */
        pinAlertSent: { type: Boolean, default: false },

        boxCount: { type: Number, required: true, min: 1 },
        /** Order IDs included in this batch */
        orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodOrder' }],

        status: {
            type: String,
            enum: ['pending', 'driver_assigned', 'driver_en_route', 'collected', 'failed'],
            default: 'pending',
            index: true
        },

        assignedAt: { type: Date, default: null },
        collectedAt: { type: Date, default: null },

        /** GPS location of driver when collection PIN was verified */
        collectionGps: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null }
        }
    },
    {
        collection: 'dmb_collection_batches',
        timestamps: true
    }
);

// ─── Indexes ───────────────────────────────────────────────────────────────
collectionBatchSchema.index({ vendorId: 1, deliveryDate: 1, deliverySlot: 1 });
collectionBatchSchema.index({ driverId: 1, status: 1 });
collectionBatchSchema.index({ deliveryDate: 1, status: 1 });

// ─── Pre-save: generate batchId ────────────────────────────────────────────
collectionBatchSchema.pre('save', function (next) {
    if (!this.batchId) {
        const ts = Date.now().toString().slice(-6);
        const rand = Math.floor(10 + Math.random() * 90);
        this.batchId = `DMB-BATCH-${ts}${rand}`;
    }
    next();
});

export const CollectionBatch = mongoose.model('CollectionBatch', collectionBatchSchema);
