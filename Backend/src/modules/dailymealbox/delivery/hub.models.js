import mongoose from 'mongoose';

/**
 * A cross-zone hand-over at a hub. One transfer per item that has to cross a zone boundary:
 *   source driver (the vendor's zone)  --PIN 1 (drop-off)-->  hub vendor  --PIN 2 (pickup)-->  zone driver (the customer's zone)
 *
 * PIN 1 exists from the moment the transfer is created; PIN 2 is generated ONLY after PIN 1 is confirmed. PINs are stored as a
 * hash (to check an entry) and encrypted (so the one person who must read it out can see it) — never in plain text.
 */
const hubTransferSchema = new mongoose.Schema(
    {
        /** What is being carried: a subscription / single meal order or a pantry bag. */
        unitKind: { type: String, enum: ['meal', 'pantry'], required: true },
        unitId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        bundleId: { type: String, default: '', index: true },
        hubVendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        /** Where the item is collected (its vendor's zone) and where it goes (the customer's zone). */
        sourceVendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true },
        sourceZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', required: true },
        destZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', required: true },
        date: { type: Date, required: true, index: true },
        slotKey: { type: String, required: true, trim: true, lowercase: true },
        sourceDriverId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null, index: true },
        zoneDriverId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null, index: true },
        items: [{ description: { type: String, default: '' }, quantity: { type: Number, default: 1 } }],

        dropPinHash: { type: String, default: '' },
        dropPinEnc: { type: String, default: '' },
        dropPinExpiresAt: { type: Date, default: null },
        dropAttempts: { type: Number, default: 0, min: 0 },
        dropConfirmed: { type: Boolean, default: false },
        dropConfirmedAt: { type: Date, default: null },

        pickupPinHash: { type: String, default: '' },
        pickupPinEnc: { type: String, default: '' },
        pickupPinExpiresAt: { type: Date, default: null },
        pickupAttempts: { type: Number, default: 0, min: 0 },
        pickupConfirmed: { type: Boolean, default: false },
        pickupConfirmedAt: { type: Date, default: null },

        status: { type: String, enum: ['pending_drop', 'holding', 'picked_up', 'failed'], default: 'pending_drop', index: true },
        /** Admin is alerted if the item is still at the hub after this moment. */
        holdingDeadline: { type: Date, default: null },
        /** The source driver's hub-stop pay, credited once when PIN 1 is confirmed. */
        dropEarning: { type: Number, default: 0, min: 0 },
        failureReason: { type: String, default: '' }
    },
    { collection: 'dmb_hub_transfers', timestamps: true }
);
hubTransferSchema.index({ unitKind: 1, unitId: 1 }, { unique: true });
hubTransferSchema.index({ hubVendorId: 1, date: 1, status: 1 });

export const DMBHubTransfer = mongoose.model('DMBHubTransfer', hubTransferSchema);
