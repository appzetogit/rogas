import mongoose from 'mongoose';
import { encryptedFields } from '../../../utils/encryptedFields.plugin.js';

/**
 * FleetPartner — Fleet company managing driver delivery operations
 * All deliveries handled by fleet partners (vendors NEVER self-deliver)
 * PRD Reference: Part 4 Admin Panel — AP-06, Driver Registration DA-02
 */
const fleetPartnerSchema = new mongoose.Schema(
    {
        companyName: { type: String, required: true, trim: true },
        nip: { type: String, trim: true },
        bankIban: { type: String, trim: true },
        contactName: { type: String, trim: true },
        contactPhone: { type: String, trim: true },
        contactEmail: { type: String, trim: true },
        city: { type: String, required: true, index: true },

        status: {
            type: String,
            enum: ['active', 'suspended'],
            default: 'active',
            index: true
        },

        /** Delivery VAT rate (Poland = 23%) — fleet partner declares this */
        deliveryVatRate: { type: Number, default: 0.23 },

        /** Drivers belonging to this fleet partner */
        drivers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner' }],

        /** Weekly invoices from fleet partner to DailyMealBox */
        invoices: [
            {
                invoiceDate: { type: Date },
                periodStart: { type: Date },
                periodEnd: { type: Date },
                amount: { type: Number },
                currency: { type: String, default: 'PLN' },
                status: {
                    type: String,
                    enum: ['pending', 'approved', 'paid', 'rejected'],
                    default: 'pending'
                },
                invoiceUrl: { type: String },
                approvedByAdminId: { type: mongoose.Schema.Types.ObjectId },
                approvedAt: { type: Date },
                paidAt: { type: Date }
            }
        ],

        approvedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },

        /**
         * Gap AD: a single courier without a company registers as individual_unregistered (działalność nierejestrowana)
         * and receives monthly settlement statements instead of invoicing (same mechanism as Track 1 cooks, Gap AB).
         */
        entityType: { type: String, enum: ['company', 'individual_unregistered'], default: 'company' },
        /** Vendors that nominated this partner and an admin linked (many vendors → one partner). */
        preferredForVendorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant' }]
    },
    {
        collection: 'fleet_partners',
        timestamps: true
    }
);

fleetPartnerSchema.index({ city: 1, status: 1 });

/** GDPR Art. 32 (Gap N): bank details are encrypted field-by-field (AES-256-GCM). */
fleetPartnerSchema.plugin(encryptedFields, { paths: ['bankIban'] });

export const FleetPartner = mongoose.model('FleetPartner', fleetPartnerSchema);
