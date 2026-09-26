import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { PaymentTransaction } from './payments.models.js';
import { getProvider, SWITCHABLE_PROVIDERS } from './providers/index.js';
import { getSettings, getProviderStatuses, updateSettings, PaymentsError } from './payments.settings.js';
import { syncFromProvider, fulfil, refundTransaction } from './payments.service.js';
import { paymentsMode, apiPublicUrl, appPublicUrl, p24Config, stripeConfig } from './payments.config.js';
import { fromMinor } from './payments.locale.js';
import { writeAudit } from '../food/admin/services/prdAdmin.service.js';
import { logger } from '../../utils/logger.js';

export const adminPaymentsRouter = express.Router();

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof PaymentsError) return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message });
        logger.error(`Admin payments error: ${err?.message || err}`);
        res.status(500).json({ success: false, message: err?.message || 'Something went wrong' });
    }
};

const isLocalUrl = (url) => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url);

/** Things that will make a provider silently not work, shown at the top of the admin page. */
const collectWarnings = async (statuses) => {
    const warnings = [];
    const settings = await getSettings();
    const api = apiPublicUrl();
    const needsWebhooks = statuses.some((s) => s.available && ['przelewy24', 'stripe', 'razorpay'].includes(s.id));
    if (needsWebhooks && isLocalUrl(api)) {
        warnings.push(`API_PUBLIC_URL is ${api}, which payment providers cannot reach. Payments still complete when the customer returns to the app, but automatic confirmations (webhooks) will not arrive until API_PUBLIC_URL is a public address.`);
    }
    if (statuses.find((s) => s.id === 'stripe')?.configured && !stripeConfig().webhookSecret) {
        warnings.push('Stripe is configured but STRIPE_WEBHOOK_SECRET is missing, so Stripe confirmations cannot be verified.');
    }
    const p24 = statuses.find((s) => s.id === 'przelewy24');
    if (p24?.configured && p24.mode === 'sandbox') warnings.push('Przelewy24 is in SANDBOX mode: no real money moves.');
    const stripe = statuses.find((s) => s.id === 'stripe');
    if (stripe?.configured && stripe.mode === 'test') warnings.push('Stripe is using TEST keys: no real money moves.');
    if (paymentsMode() === 'mock') warnings.push('Mock payments are ON (development only): a "Test payment" option that always succeeds is offered to customers.');
    for (const rule of settings.countryRules || []) {
        const usable = rule.providers.filter((id) => statuses.find((s) => s.id === id)?.available);
        if (!usable.length) warnings.push(`${rule.country === '*' ? 'Other countries' : rule.country}: none of its providers is switched on and configured, customers there fall back to the "Other countries" rule.`);
    }
    return warnings;
};

// Overview: provider switches, routing rules, environment facts.
adminPaymentsRouter.get('/', requirePermission('systemSettings', 'view'), handle(async (_req, res) => {
    const [providers, settings] = await Promise.all([getProviderStatuses(), getSettings()]);
    res.json({
        success: true,
        data: {
            providers,
            countryRules: settings.countryRules,
            defaultCountry: settings.defaultCountry,
            mockMode: paymentsMode() === 'mock',
            urls: {
                app: appPublicUrl(),
                api: apiPublicUrl(),
                webhooks: {
                    przelewy24: `${apiPublicUrl()}/api/v1/payments/webhook/przelewy24`,
                    stripe: `${apiPublicUrl()}/api/v1/payments/webhook/stripe`,
                    razorpay: `${apiPublicUrl()}/api/v1/payments/webhook/razorpay`
                }
            },
            przelewy24: { posId: p24Config().posId || null, sandbox: p24Config().sandbox },
            warnings: await collectWarnings(providers)
        }
    });
}));

// Switch providers on/off and edit the country rules.
adminPaymentsRouter.put('/settings', requirePermission('systemSettings', 'edit'), handle(async (req, res) => {
    const { before, after } = await updateSettings(req.body || {}, String(req.user?.userId || ''));
    await writeAudit(req, 'payments.settings.update', 'PaymentSettings', 'default', { providers: before.providers, countryRules: before.countryRules, defaultCountry: before.defaultCountry }, { providers: after.providers, countryRules: after.countryRules, defaultCountry: after.defaultCountry }, req.body?.reason);
    const providers = await getProviderStatuses();
    res.json({ success: true, data: { providers, countryRules: after.countryRules, defaultCountry: after.defaultCountry, warnings: await collectWarnings(providers) } });
}));

// "Test connection": proves the server-side keys work without spending money.
adminPaymentsRouter.post('/providers/:id/test', requirePermission('systemSettings', 'edit'), handle(async (req, res) => {
    if (!SWITCHABLE_PROVIDERS.includes(req.params.id)) throw new PaymentsError('Unknown provider', 404);
    res.json({ success: true, data: await getProvider(req.params.id).testConnection() });
}));

const shape = (tx) => ({
    id: tx.publicId,
    _id: tx._id,
    provider: tx.provider,
    purpose: tx.purpose,
    status: tx.status,
    amount: fromMinor(tx.amountMinor, tx.currency),
    currency: tx.currency,
    refunded: fromMinor(tx.refundedMinor || 0, tx.currency),
    country: tx.country,
    description: tx.description,
    customer: tx.customer,
    ownerType: tx.ownerType,
    ownerId: tx.ownerId,
    flags: tx.flags,
    fulfilled: Boolean(tx.fulfilment?.done),
    fulfilmentError: tx.fulfilment?.error || '',
    providerOrderId: tx.providerOrderId,
    providerPaymentId: tx.providerPaymentId,
    failureReason: tx.failureReason,
    paidAt: tx.paidAt,
    createdAt: tx.createdAt
});

adminPaymentsRouter.get('/transactions', requirePermission('systemSettings', 'view'), handle(async (req, res) => {
    const { status, provider, purpose, q } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = {};
    if (status === 'attention') filter.$or = [{ flags: { $exists: true, $ne: [] } }, { status: 'paid', 'fulfilment.done': { $ne: true } }];
    else if (status) filter.status = String(status);
    if (provider) filter.provider = String(provider);
    if (purpose) filter.purpose = String(purpose);
    if (q) {
        const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$and = [...(filter.$and || []), { $or: [{ publicId: rx }, { providerOrderId: rx }, { providerPaymentId: rx }, { 'customer.email': rx }, { 'customer.name': rx }, { description: rx }] }];
    }
    const [rows, total] = await Promise.all([
        PaymentTransaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        PaymentTransaction.countDocuments(filter)
    ]);
    res.json({ success: true, data: { transactions: rows.map(shape), total, page, limit, totalPages: Math.ceil(total / limit) } });
}));

adminPaymentsRouter.get('/transactions/:id', requirePermission('systemSettings', 'view'), handle(async (req, res) => {
    const tx = await PaymentTransaction.findOne({ publicId: req.params.id }).lean();
    if (!tx) throw new PaymentsError('Payment not found', 404);
    res.json({ success: true, data: { ...shape(tx), refs: tx.refs, events: tx.events, refunds: tx.refunds } });
}));

// Ask the provider what happened and settle accordingly (useful when a webhook never arrived).
adminPaymentsRouter.post('/transactions/:id/recheck', requirePermission('systemSettings', 'edit'), handle(async (req, res) => {
    const tx = await PaymentTransaction.findOne({ publicId: req.params.id });
    if (!tx) throw new PaymentsError('Payment not found', 404);
    let after = await syncFromProvider(tx);
    if (after && ['paid', 'partially_refunded', 'refunded'].includes(after.status) && !after.fulfilment?.done) after = await fulfil(after);
    await writeAudit(req, 'payments.recheck', 'PaymentTransaction', tx.publicId, { status: tx.status }, { status: after?.status }, req.body?.reason);
    res.json({ success: true, data: shape(after || tx) });
}));

adminPaymentsRouter.post('/transactions/:id/refund', requirePermission('systemSettings', 'edit'), handle(async (req, res) => {
    const tx = await refundTransaction(req.params.id, { amount: req.body?.amount, reason: req.body?.reason, actor: String(req.user?.userId || '') });
    await writeAudit(req, 'payments.refund', 'PaymentTransaction', tx.publicId, null, { refundedMinor: tx.refundedMinor, status: tx.status }, req.body?.reason);
    res.json({ success: true, data: shape(tx) });
}));
