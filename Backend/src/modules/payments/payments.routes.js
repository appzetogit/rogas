import express from 'express';
import { authMiddleware } from '../../core/auth/auth.middleware.js';
import { PaymentTransaction } from './payments.models.js';
import { resolvePaymentContext, resolveProviders } from './payments.settings.js';
import { getProvider } from './providers/index.js';
import {
    getPublicStatus, confirmRazorpayPayment, confirmMockPayment, handleWebhook, PaymentsError
} from './payments.service.js';
import { paymentsMode } from './payments.config.js';
import { logger } from '../../utils/logger.js';

const fail = (res, err) => {
    if (err instanceof PaymentsError) return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message });
    logger.error(`Payments route error: ${err?.message || err}`);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
};

/** The account that started a payment is the only one that may confirm it. */
const ownsTransaction = (req, tx) => {
    const ids = [req.user?.userId, req.user?._id, req.user?.accountId, req.user?.id].filter(Boolean).map(String);
    return Boolean(tx.ownerId) && ids.includes(String(tx.ownerId));
};

export const paymentsRouter = express.Router();

/**
 * GET /api/v1/payments/methods?zoneId=&country=
 * What the checkout screen may offer this customer. Public: it reveals nothing but provider names and the currency.
 */
paymentsRouter.get('/methods', async (req, res) => {
    try {
        const ctx = await resolvePaymentContext({ zoneId: req.query.zoneId, country: req.query.country, dialCode: req.query.dialCode });
        const ids = await resolveProviders(ctx);
        res.json({
            success: true,
            country: ctx.country,
            currency: ctx.currency,
            providers: ids.map((id) => ({ id, label: getProvider(id).label })),
            mock: paymentsMode() === 'mock'
        });
    } catch (err) {
        fail(res, err);
    }
});

/**
 * GET /api/v1/payments/:publicId/status?t=<statusToken>
 * Polled by the payment-return page. The token in the return URL is the credential, so no login is needed.
 */
paymentsRouter.get('/:publicId/status', async (req, res) => {
    try {
        res.json({ success: true, ...(await getPublicStatus(req.params.publicId, req.query.t)) });
    } catch (err) {
        fail(res, err);
    }
});

/** POST /api/v1/payments/:publicId/razorpay-confirm: the Razorpay pop-up finished (signature + payment are verified). */
paymentsRouter.post('/:publicId/razorpay-confirm', authMiddleware, async (req, res) => {
    try {
        const tx = await PaymentTransaction.findOne({ publicId: req.params.publicId });
        if (!tx || !ownsTransaction(req, tx)) throw new PaymentsError('Payment not found', 404, 'NOT_FOUND');
        const after = await confirmRazorpayPayment(tx, req.body || {});
        res.json({ success: true, status: after.status, fulfilled: Boolean(after.fulfilment?.done) });
    } catch (err) {
        fail(res, err);
    }
});

/** POST /api/v1/payments/:publicId/mock-confirm: development-only instant payment. */
paymentsRouter.post('/:publicId/mock-confirm', authMiddleware, async (req, res) => {
    try {
        if (paymentsMode() !== 'mock') throw new PaymentsError('Test payments are disabled', 403, 'MOCK_DISABLED');
        const tx = await PaymentTransaction.findOne({ publicId: req.params.publicId });
        if (!tx || !ownsTransaction(req, tx)) throw new PaymentsError('Payment not found', 404, 'NOT_FOUND');
        const after = await confirmMockPayment(tx);
        res.json({ success: true, status: after.status, fulfilled: Boolean(after.fulfilment?.done) });
    } catch (err) {
        fail(res, err);
    }
});

// ─── Webhooks (mounted separately under /payments/webhook, no login: the provider signature is the credential) ───

export const providerWebhook = (providerId) => async (req, res) => {
    try {
        await handleWebhook(providerId, req);
        res.status(200).json({ status: 'ok' });
    } catch (err) {
        if (err instanceof PaymentsError && err.statusCode === 400) return res.status(400).send('Invalid webhook');
        // Anything else is on our side: answer 500 so the provider retries later.
        logger.error(`${providerId} webhook processing failed: ${err?.message || err}`);
        res.status(500).send('Webhook processing failed');
    }
};
