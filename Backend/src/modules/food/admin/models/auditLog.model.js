import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
    {
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', index: true },
        actorEmail: { type: String, trim: true, default: '' },
        actorRole: { type: String, trim: true, default: '' },
        action: { type: String, required: true, trim: true, index: true },
        entityType: { type: String, required: true, trim: true, index: true },
        entityId: { type: String, trim: true, default: '', index: true },
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminCity', default: null, index: true },
        previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
        newValue: { type: mongoose.Schema.Types.Mixed, default: null },
        reason: { type: String, trim: true, default: '' },
        ip: { type: String, trim: true, default: '' },
        userAgent: { type: String, trim: true, default: '' }
    },
    {
        collection: 'admin_audit_logs',
        timestamps: true
    }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export const AdminAuditLog = mongoose.model('AdminAuditLog', auditLogSchema);
