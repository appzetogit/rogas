import mongoose from 'mongoose';

/** One stored value of an ACM control: platform-wide (cityId null) or a per-city override. */
const platformControlSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, trim: true },
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminCity', default: null },
        value: { type: mongoose.Schema.Types.Mixed, default: {} },
        previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        updatedByEmail: { type: String, default: '' }
    },
    { collection: 'dmb_platform_controls', timestamps: true }
);
platformControlSchema.index({ key: 1, cityId: 1 }, { unique: true });

export const DMBPlatformControl = mongoose.model('DMBPlatformControl', platformControlSchema);

/**
 * AdminAlert — the AP-01 alerts panel. Raised by background jobs (no-show, unconfirmed shift, low stock, bad debt,
 * Track 1 threshold, …) so City Managers see them in the panel and not only in an inbox.
 * `dedupeKey` makes raising the same alert twice a no-op while it is still open.
 */
const adminAlertSchema = new mongoose.Schema(
    {
        type: { type: String, required: true, trim: true, index: true },
        severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning', index: true },
        title: { type: String, required: true, trim: true },
        message: { type: String, default: '', trim: true },
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminCity', default: null, index: true },
        entityType: { type: String, default: '' },
        entityId: { type: String, default: '' },
        link: { type: String, default: '' },
        data: { type: mongoose.Schema.Types.Mixed, default: {} },
        dedupeKey: { type: String, default: null },
        status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open', index: true },
        acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        acknowledgedAt: { type: Date, default: null }
    },
    { collection: 'dmb_admin_alerts', timestamps: true }
);
adminAlertSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
adminAlertSchema.index({ status: 1, createdAt: -1 });

export const DMBAdminAlert = mongoose.model('DMBAdminAlert', adminAlertSchema);
