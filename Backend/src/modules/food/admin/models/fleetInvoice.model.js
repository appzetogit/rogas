import mongoose from 'mongoose';

const invoiceLineSchema = new mongoose.Schema({
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', required: true },
    driverName: { type: String, default: '' },
    deliveriesCount: { type: Number, default: 0 },
    grossDeliveryFee: { type: Number, default: 0 }, // PLN
    tips: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
}, { _id: false });

const fleetInvoiceSchema = new mongoose.Schema({
    invoiceRef: { type: String, unique: true, index: true },
    fleetPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FleetPartner', required: true, index: true },
    weekStartDate: { type: Date, required: true },
    weekEndDate: { type: Date, required: true },
    // Pre-filled from delivery data
    lines: { type: [invoiceLineSchema], default: [] },
    totalDeliveries: { type: Number, default: 0 },
    grossServiceFee: { type: Number, default: 0 }, // PLN, before VAT
    vatRate: { type: Number, default: 0.23 }, // 23% default
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 }, // gross + VAT
    currency: { type: String, default: 'PLN' },
    status: {
        type: String,
        enum: ['draft', 'submitted', 'approved', 'paid', 'rejected'],
        default: 'draft',
        index: true
    },
    submittedAt: { type: Date, default: null },
    approvedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    paidAt: { type: Date, default: null },
    paymentRef: { type: String, default: '' },
    // PDF
    invoicePdfUrl: { type: String, default: '' },
    // Notes
    accountantNote: { type: String, default: '' }
}, {
    collection: 'fleet_invoices',
    timestamps: true
});

fleetInvoiceSchema.index({ fleetPartnerId: 1, weekStartDate: -1 });
fleetInvoiceSchema.index({ status: 1, createdAt: -1 });

fleetInvoiceSchema.pre('save', function (next) {
    if (!this.invoiceRef) {
        const ts = Date.now().toString(36).toUpperCase();
        this.invoiceRef = `FI-${ts}`;
    }
    this.vatAmount = Math.round(this.grossServiceFee * this.vatRate * 100) / 100;
    this.totalAmount = Math.round((this.grossServiceFee + this.vatAmount) * 100) / 100;
    next();
});

export const FleetInvoice = mongoose.model('FleetInvoice', fleetInvoiceSchema);
