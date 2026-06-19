import mongoose from 'mongoose';

const otaConfigSchema = new mongoose.Schema(
    {
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminCity', default: null, index: true },
        type: { type: String, enum: ['theme', 'language'], required: true, index: true },
        languageCode: { type: String, trim: true, default: '' },
        version: { type: Number, default: 1, min: 1 },
        status: { type: String, enum: ['draft', 'approved', 'published', 'archived'], default: 'draft' },
        payload: { type: mongoose.Schema.Types.Mixed, default: {} },
        validation: { type: mongoose.Schema.Types.Mixed, default: {} },
        publishedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    {
        collection: 'admin_ota_configs',
        timestamps: true
    }
);

otaConfigSchema.index({ cityId: 1, type: 1, languageCode: 1, version: -1 });

export const AdminOtaConfig = mongoose.model('AdminOtaConfig', otaConfigSchema);
