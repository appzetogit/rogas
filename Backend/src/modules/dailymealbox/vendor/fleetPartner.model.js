import mongoose from 'mongoose';

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
                currency: { type: String, default: 'INR' },
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

        approvedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
    },
    {
        collection: 'fleet_partners',
        timestamps: true
    }
);

fleetPartnerSchema.index({ city: 1, status: 1 });

export const FleetPartner = mongoose.model('FleetPartner', fleetPartnerSchema);
