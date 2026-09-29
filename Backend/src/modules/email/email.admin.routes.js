import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { EmailLog } from './email.models.js';
import { isSmtpConfigured, smtpConfig, EMAIL_MAX_ATTEMPTS } from './email.config.js';
import { testConnection, resendById } from './email.service.js';
import { writeAudit } from '../food/admin/services/prdAdmin.service.js';
import { logger } from '../../utils/logger.js';

export const adminEmailRouter = express.Router();

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        logger.error(`Admin email error: ${err?.message || err}`);
        res.status(500).json({ success: false, message: err?.message || 'Something went wrong' });
    }
};

const shape = (log) => ({
    id: log._id,
    to: log.to,
    templateKey: log.templateKey,
    subject: log.subject,
    language: log.language,
    status: log.status,
    attempts: log.attempts,
    lastError: log.lastError,
    ownerType: log.ownerType,
    ownerId: log.ownerId,
    sentAt: log.sentAt,
    createdAt: log.createdAt
});

// Configuration state + a day of send/fail counts, for the admin overview.
adminEmailRouter.get('/', requirePermission('systemSettings', 'view'), handle(async (_req, res) => {
    const configured = isSmtpConfigured();
    const cfg = smtpConfig();
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [sent24h, failed24h, pendingRetry] = await Promise.all([
        EmailLog.countDocuments({ status: 'sent', sentAt: { $gte: since } }),
        EmailLog.countDocuments({ status: 'failed', createdAt: { $gte: since } }),
        EmailLog.countDocuments({ status: 'failed', attempts: { $lt: EMAIL_MAX_ATTEMPTS } })
    ]);
    const warnings = [];
    if (!configured) warnings.push('SMTP is not configured (EMAIL_HOST, EMAIL_USER, EMAIL_PASS): no email can be sent.');
    res.json({
        success: true,
        data: {
            configured,
            host: cfg.host || null,
            port: cfg.port,
            from: cfg.from,
            stats: { sent24h, failed24h, pendingRetry },
            warnings
        }
    });
}));

adminEmailRouter.post('/test', requirePermission('systemSettings', 'edit'), handle(async (_req, res) => {
    res.json({ success: true, data: await testConnection() });
}));

adminEmailRouter.get('/logs', requirePermission('systemSettings', 'view'), handle(async (req, res) => {
    const { status, templateKey, q } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = {};
    if (status) filter.status = String(status);
    if (templateKey) filter.templateKey = String(templateKey);
    if (q) {
        const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ to: rx }, { subject: rx }, { templateKey: rx }];
    }
    const [rows, total] = await Promise.all([
        EmailLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        EmailLog.countDocuments(filter)
    ]);
    res.json({ success: true, data: { logs: rows.map(shape), total, page, limit, totalPages: Math.ceil(total / limit) } });
}));

adminEmailRouter.get('/logs/:id', requirePermission('systemSettings', 'view'), handle(async (req, res) => {
    const log = await EmailLog.findById(req.params.id).lean();
    if (!log) return res.status(404).json({ success: false, message: 'Email not found' });
    res.json({ success: true, data: { ...shape(log), html: log.html } });
}));

// Retries right now, regardless of the backoff schedule or the attempt cap — for a customer who needs it sooner.
adminEmailRouter.post('/logs/:id/resend', requirePermission('systemSettings', 'edit'), handle(async (req, res) => {
    const before = await EmailLog.findById(req.params.id).select('status attempts').lean();
    const after = await resendById(req.params.id);
    if (!after) return res.status(404).json({ success: false, message: 'Email not found' });
    await writeAudit(req, 'email.resend', 'EmailLog', String(after._id), before, { status: after.status, attempts: after.attempts }, req.body?.reason);
    res.json({ success: true, data: shape(after) });
}));
