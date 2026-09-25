import mongoose from 'mongoose';

/**
 * RideTransfer — Tracks delivery ride reassignment requests
 * Created when admin approves a delivery_unavailable ServiceRequest
 * and assigns replacement driver(s).
 * 
 * Fully independent — does not modify existing delivery assignment logic.
 */

const rideTransferSchema = new mongoose.Schema(
    {
        /** Human-readable transfer ID e.g. SVC-RIDE-123456 */
        transferId: {
            type: String,
            unique: true,
            sparse: true,
            index: true
        },

        /** The original delivery unavailability request */
        serviceRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ServiceRequest',
            required: true,
            index: true
        },

        /** Original driver who is unavailable */
        originalDriverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            required: true,
            index: true
        },

        /** Replacement driver being asked to cover */
        assignedDriverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            required: true,
            index: true
        },

        /** Delivery date for the transfer */
        date: {
            type: Date,
            required: true
        },

        /** Delivery slot */
        slot: {
            type: String,
            required: true
        },

        /** Zone for the delivery */
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone',
            default: null
        },

        /** Number of orders to transfer */
        orderCount: {
            type: Number,
            default: 0,
            min: 0
        },

        /** Response status from the replacement driver */
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected'],
            default: 'pending',
            index: true
        },

        /** When the driver responded */
        respondedAt: {
            type: Date,
            default: null
        }
    },
    {
        collection: 'dmb_ride_transfers',
        timestamps: true
    }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
rideTransferSchema.index({ assignedDriverId: 1, status: 1 });
rideTransferSchema.index({ serviceRequestId: 1, status: 1 });

// ─── Pre-save: generate transferId ───────────────────────────────────────────
rideTransferSchema.pre('save', function (next) {
    if (!this.transferId) {
        const ts = Date.now().toString().slice(-6);
        const rand = Math.floor(100 + Math.random() * 900);
        this.transferId = `SVC-RIDE-${ts}${rand}`;
    }
    next();
});

export const RideTransfer = mongoose.model('RideTransfer', rideTransferSchema);
