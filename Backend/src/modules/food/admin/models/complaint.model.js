import mongoose from 'mongoose';

const statusTrailSchema = new mongoose.Schema({
    status: { type: String, enum: ['open', 'in_review', 'resolved', 'escalated', 'closed'], required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin' },
    changedByName: { type: String, default: '' },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now }
}, { _id: false });

const refundSplitSchema = new mongoose.Schema({
    vendorClawback: { type: Number, default: 0 },
    fleetClawback: { type: Number, default: 0 },
    commissionReturn: { type: Number, default: 0 },
    vatAmount: { type: Number, default: 0 },
    totalRefund: { type: Number, default: 0 },
    currency: { type: String, default: 'PLN' },
    processedAt: { type: Date, default: null }
}, { _id: false });

const complaintSchema = new mongoose.Schema({
    complaintRef: { type: String, unique: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodOrder', default: null, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', default: null, index: true },
    complainantType: { type: String, enum: ['customer', 'delivery_partner', 'vendor'], default: 'customer', index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', default: null },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null },
    subject: { type: String, trim: true, default: '' },
    message: { type: String, required: true, trim: true },
    proofPhotos: { type: [String], default: [] },
    deliveryGpsLat: { type: Number, default: null },
    deliveryGpsLng: { type: Number, default: null },
    category: {
        type: String,
        enum: ['wrong_item', 'missing_item', 'late_delivery', 'delivery_failed', 'quality', 'payment', 'driver_behaviour', 'orders', 'payments', 'menu', 'restaurant', 'technical', 'other'],
        default: 'other'
    },
    status: {
        type: String,
        enum: ['open', 'in_review', 'resolved', 'escalated', 'closed'],
        default: 'open',
        index: true
    },
    statusTrail: { type: [statusTrailSchema], default: [] },
    assignedAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    assignedAgentName: { type: String, default: '' },
    // Refund fields
    refundType: { type: String, enum: ['none', 'full', 'partial'], default: 'none' },
    refundAmount: { type: Number, default: 0 },
    refundStatus: { type: String, enum: ['pending', 'processed', 'failed', 'none'], default: 'none' },
    refundSplit: { type: refundSplitSchema, default: null },
    // Auto-escalation
    autoEscalateAt: { type: Date, default: null },
    escalatedToId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    // CS agent limit enforcement (PLN)
    csRefundLimit: { type: Number, default: 150 },
    // Response sent to customer
    customerResponseSent: { type: Boolean, default: false },
    customerResponseMessage: { type: String, default: '' },
    customerResponseAt: { type: Date, default: null },
    // Internal note
    internalNote: { type: String, default: '' },
    city: { type: String, default: '' },
    legacyTicketId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    resolvedAt: { type: Date, default: null }
}, {
    collection: 'admin_complaints',
    timestamps: true
});

complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ customerId: 1, createdAt: -1 });
complaintSchema.index({ autoEscalateAt: 1, status: 1 });

// Auto-generate complaintRef
complaintSchema.pre('save', function (next) {
    if (!this.complaintRef) {
        const ts = Date.now().toString(36).toUpperCase();
        const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
        this.complaintRef = `C-${ts}${rand}`;
    }
    next();
});

export const AdminComplaint = mongoose.model('AdminComplaint', complaintSchema);
