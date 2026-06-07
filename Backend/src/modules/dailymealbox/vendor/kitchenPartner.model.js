import mongoose from 'mongoose';

/**
 * KitchenPartner — Legal entity for home cooks (EU compliance)
 * Home cooks link to a Kitchen Partner company for invoicing and VAT
 * PRD Reference: Section 3 (Home Cook Legal Model), VM-02
 */
const kitchenPartnerSchema = new mongoose.Schema(
    {
        companyName: { type: String, required: true, trim: true },
        nip: { type: String, trim: true },             // Polish tax ID
        krs: { type: String, trim: true },             // Polish company registry
        bankIban: { type: String, trim: true },

        status: {
            type: String,
            enum: ['active', 'suspended'],
            default: 'active',
            index: true
        },
        city: { type: String, required: true, index: true },
        zoneIds: [{ type: String }],

        /** Home cooks linked to this kitchen partner */
        homeCooks: [
            {
                cookId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant' },
                cookName: { type: String },
                cookPhone: { type: String },
                contractSignedAt: { type: Date },
                contractUrl: { type: String },
                /** Cook's share of food revenue (e.g. 0.85 = 85%) */
                settlementSplit: { type: Number, default: 0.85, min: 0, max: 1 },
                status: { type: String, enum: ['active', 'inactive'], default: 'active' }
            }
        ],

        /** Kitchen Partner management fee (e.g. 0.15 = 15%) */
        managementFeePct: { type: Number, default: 0.15, min: 0, max: 1 },

        /** EU food licence — Google Drive URL */
        foodLicenceUrl: { type: String, default: '' },
        foodLicenceExpiry: { type: Date, default: null },
        insuranceUrl: { type: String, default: '' },

        approvedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
    },
    {
        collection: 'kitchen_partners',
        timestamps: true
    }
);

kitchenPartnerSchema.index({ city: 1, status: 1 });

export const KitchenPartner = mongoose.model('KitchenPartner', kitchenPartnerSchema);
