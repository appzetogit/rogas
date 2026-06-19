import mongoose from 'mongoose';

const integrationSettingSchema = new mongoose.Schema(
    {
        provider: { type: String, required: true, trim: true, index: true },
        label: { type: String, required: true, trim: true },
        category: { type: String, trim: true, default: 'integration' },
        environment: { type: String, enum: ['dev', 'qa', 'prod'], default: 'prod', index: true },
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminCity', default: null, index: true },
        status: { type: String, enum: ['not_configured', 'active', 'inactive', 'error'], default: 'not_configured' },
        publicConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
        secretRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
        requires2fa: { type: Boolean, default: true },
        lastCheckedAt: { type: Date, default: null },
        lastChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    {
        collection: 'admin_integration_settings',
        timestamps: true
    }
);

integrationSettingSchema.index({ provider: 1, environment: 1, cityId: 1 }, { unique: true });

export const AdminIntegrationSetting = mongoose.model('AdminIntegrationSetting', integrationSettingSchema);
