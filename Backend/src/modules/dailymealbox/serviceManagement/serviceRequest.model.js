import mongoose from 'mongoose';

/**
 * ServiceRequest — Polymorphic model for all service management requests
 * Handles: delivery unavailability, vendor meal unavailability, customer refund/extend
 * 
 * Architecture: Fully independent module — no modifications to existing models.
 * Links to existing collections via ObjectId references only.
 */

const serviceRequestSchema = new mongoose.Schema(
    {
        /** Human-readable request ID e.g. SVC-REQ-123456 */
        requestId: {
            type: String,
            unique: true,
            sparse: true,
            index: true
        },

        /**
         * Request type discriminator:
         * - delivery_unavailable: Driver can't deliver on a date/slot
         * - vendor_unavailable: Vendor can't prepare meals on a date/slot
         * - customer_refund: Customer requests refund for affected meal
         * - customer_extend: Customer chooses to extend subscription instead
         */
        requestType: {
            type: String,
            enum: ['delivery_unavailable', 'vendor_unavailable', 'customer_refund', 'customer_extend'],
            required: true,
            index: true
        },

        /** Current lifecycle status */
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'completed'],
            default: 'pending',
            index: true
        },

        /** The user/vendor/driver who created the request */
        requesterId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },

        /** Role of the requester for query filtering */
        requesterRole: {
            type: String,
            enum: ['DELIVERY_PARTNER', 'RESTAURANT', 'USER', 'SYSTEM'],
            required: true
        },

        // ─── Optional Reference Fields ───────────────────────────────────────

        /** Vendor reference (for vendor_unavailable and customer requests) */
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            default: null,
            index: true
        },

        /** Subscription reference (for customer requests) */
        subscriptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBSubscription',
            default: null
        },

        /** Affected meal plan (for vendor/customer requests) */
        mealPlanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DMBMealPlan',
            default: null
        },

        /** Zone reference (for delivery requests) */
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone',
            default: null
        },

        // ─── Request Details ──────────────────────────────────────────────────

        /** The affected date */
        date: {
            type: Date,
            required: true,
            index: true
        },

        /** The affected delivery slot (Legacy / Single slot logic) */
        slot: {
            type: String,
            enum: ['breakfast', 'lunch', 'dinner'],
        },

        /** The affected delivery slots (Multiple slot logic for vendors) */
        slots: [{
            type: String,
            enum: ['breakfast', 'lunch', 'dinner'],
        }],

        /** Reason for the request */
        reason: {
            type: String,
            required: true,
            trim: true
        },

        /** Optional remarks */
        remarks: {
            type: String,
            default: '',
            trim: true
        },

        /** Refund amount (only for customer_refund requests) */
        refundAmount: {
            type: Number,
            default: 0,
            min: 0
        },

        /** Links customer requests back to the vendor request that spawned them */
        parentRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ServiceRequest',
            default: null
        },

        // ─── Resolution ──────────────────────────────────────────────────────

        /** When the request was resolved */
        resolvedAt: {
            type: Date,
            default: null
        },

        /** Admin who resolved the request */
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },

        /** Admin notes on resolution */
        adminNotes: {
            type: String,
            default: '',
            trim: true
        }
    },
    {
        collection: 'dmb_service_requests',
        timestamps: true
    }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
serviceRequestSchema.index({ requestType: 1, status: 1 });
serviceRequestSchema.index({ requesterId: 1, requestType: 1 });
serviceRequestSchema.index({ vendorId: 1, date: 1 });
serviceRequestSchema.index({ parentRequestId: 1 });

// ─── Pre-save: generate requestId ────────────────────────────────────────────
serviceRequestSchema.pre('save', function (next) {
    if (!this.requestId) {
        const ts = Date.now().toString().slice(-6);
        const rand = Math.floor(100 + Math.random() * 900);
        this.requestId = `SVC-REQ-${ts}${rand}`;
    }
    next();
});

export const ServiceRequest = mongoose.model('ServiceRequest', serviceRequestSchema);
