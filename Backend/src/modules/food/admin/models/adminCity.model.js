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
        currency: { type: String, required: true, trim: true, uppercase: true, default: 'INR' },
        vatRate: { type: Number, default: 0, min: 0 },
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
