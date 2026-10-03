import mongoose from 'mongoose';

const gatewaySchema = new mongoose.Schema(
    {
        provider: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: false },
        config: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    { _id: false }
);

const activationChecklistSchema = new mongoose.Schema(
    {
        hasApprovedVendor: { type: Boolean, default: false },
        hasApprovedDriver: { type: Boolean, default: false },
        hasZone: { type: Boolean, default: false },
        hasGateway: { type: Boolean, default: false },
        hasLanguage: { type: Boolean, default: false }
    },
    { _id: false }
);

const adminCitySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        country: { type: String, required: true, trim: true, index: true },
        status: {
            type: String,
            enum: ['planned', 'in_setup', 'active', 'inactive'],
            default: 'planned',
            index: true
        },
        // Left as 'INR', not the platform default: payments.settings.js's currencyFor() specifically treats an
        // unchanged 'INR' as "never really set" for any non-Indian country, so it can fall back to that country's
        // real default currency. Changing this default would break that detection — see currencyFor() before
        // touching this.
        currency: { type: String, required: true, trim: true, uppercase: true, default: 'INR' },
        // Legacy single rate; superseded by `vat` below and no longer read by any calculation.
        vatRate: { type: Number, default: 0, min: 0 },
        // VAT percentages per category (PRD §2.1). No defaults on purpose: a city with a missing rate must fail
        // loudly in the calculation (see cityVat.service.js) instead of silently using a made-up number.
        vat: {
            type: new mongoose.Schema(
                {
                    foodRestaurant: { type: Number, default: null, min: 0, max: 100 },
                    foodBasic: { type: Number, default: null, min: 0, max: 100 },
                    delivery: { type: Number, default: null, min: 0, max: 100 },
                    service: { type: Number, default: null, min: 0, max: 100 },
                    tips: { type: Number, default: null, min: 0, max: 100 }
                },
                { _id: false }
            ),
            default: () => ({})
        },
        defaultLanguage: { type: String, trim: true, default: 'en' },
        enabledLanguages: { type: [String], default: ['en'] },
        paymentGateways: { type: [gatewaySchema], default: [] },
        zoneIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone' }],
        activationChecklist: { type: activationChecklistSchema, default: () => ({}) },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    {
        collection: 'admin_cities',
        timestamps: true
    }
);

adminCitySchema.index({ country: 1, name: 1 }, { unique: true });

export const AdminCity = mongoose.model('AdminCity', adminCitySchema);
