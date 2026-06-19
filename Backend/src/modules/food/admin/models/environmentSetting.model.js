import mongoose from 'mongoose';

const environmentSettingSchema = new mongoose.Schema(
    {
        environment: { type: String, enum: ['dev', 'qa', 'prod'], required: true, unique: true },
        isActive: { type: Boolean, default: false },
        apiBaseUrl: { type: String, trim: true, default: '' },
        adminBaseUrl: { type: String, trim: true, default: '' },
        appVersion: { type: String, trim: true, default: '' },
        releaseChannel: { type: String, trim: true, default: 'stable' },
        maintenanceMode: { type: Boolean, default: false },
        config: { type: mongoose.Schema.Types.Mixed, default: {} },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    {
        collection: 'admin_environment_settings',
        timestamps: true
    }
);

export const AdminEnvironmentSetting = mongoose.model('AdminEnvironmentSetting', environmentSettingSchema);
