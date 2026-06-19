import mongoose from 'mongoose';

const scheduledChangeSchema = new mongoose.Schema(
    {
        state: { type: String, enum: ['on', 'off', 'partial'], required: true },
        runAt: { type: Date, required: true },
        reason: { type: String, trim: true, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        appliedAt: { type: Date, default: null }
    },
    { _id: true, timestamps: true }
);

const featureToggleSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, trim: true, index: true },
        label: { type: String, required: true, trim: true },
        category: { type: String, required: true, trim: true, index: true },
        scope: { type: String, enum: ['platform', 'city'], default: 'platform', index: true },
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminCity', default: null, index: true },
        state: { type: String, enum: ['on', 'off', 'partial'], default: 'on' },
        config: { type: mongoose.Schema.Types.Mixed, default: {} },
        locked: { type: Boolean, default: false },
        lastChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        lastChangedAt: { type: Date, default: null },
        rollbackUntil: { type: Date, default: null },
        previousState: { type: String, enum: ['on', 'off', 'partial', null], default: null },
        previousConfig: { type: mongoose.Schema.Types.Mixed, default: null },
        scheduledChanges: { type: [scheduledChangeSchema], default: [] }
    },
    {
        collection: 'admin_feature_toggles',
        timestamps: true
    }
);

featureToggleSchema.index({ key: 1, scope: 1, cityId: 1 }, { unique: true });

export const AdminFeatureToggle = mongoose.model('AdminFeatureToggle', featureToggleSchema);
