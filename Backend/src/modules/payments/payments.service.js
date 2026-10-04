import crypto from 'crypto';
import { PaymentTransaction, PaymentWebhookEvent, newPublicId, newStatusToken, PURPOSES } from './payments.models.js';
import { getProvider, isKnownProvider } from './providers/index.js';
import { resolveProviders, PaymentsError } from './payments.settings.js';
import { toMinor, fromMinor } from './payments.locale.js';
import { PAYMENT_WINDOW_MINUTES } from './payments.config.js';
import { getPurpose } from './purposes/index.js';
import { logger } from '../../utils/logger.js';
import { queueEmail } from '../email/email.service.js';

export { PaymentsError };

const PAID_LIKE = ['paid', 'partially_refunded', 'refunded'];
const OPEN = ['created', 'pending'];
const FULFIL_LOCK_MS = 60_000;

/**
 * Building blocks for "what happened to your payment" emails, covering every purpose (subscription, pantry,
 * wallet top-up, tip, office, driver deposit) at once — the transaction already carries who to email and in what
 * language, so nothing purpose-specific is needed here.
 *
 * IMPORTANT: each `queueEmail({...})` call below is written out at its own call site, with the English
 * subjectKey/bodyKey text as literal strings, rather than forwarded through a shared function. The i18n catalog
 * extractor (Frontend/scripts/i18n/extract-catalog.mjs) statically finds `queueEmail({ subjectKey: "...", ... })`
 * calls in the source — a literal at the call site is required for a string to become translatable; forwarding it
 * through a variable would silently hide it from every language but English. `emailSafe(...)` only wraps the
 * resulting promise, so it never hides the call itself.
 */
const emailSafe = (promise, label) => promise.catch((err) => logger.warn(`${label} not sent: ${err?.message || err}`));

/** Vars every payment-result email shares. */
const paymentVars = (tx, extra = {}) => ({ description: tx.description || tx.purpose, amount: fromMinor(tx.amountMinor, tx.currency).toFixed(2), currency: tx.currency, ...extra });
const adminVars = (tx, extra = {}) => ({ publicId: tx.publicId, purpose: tx.purpose, customerEmail: tx.customer?.email || 'unknown', ...paymentVars(tx, extra) });

/** The address the admin (support inbox) is told about a payment problem worth their attention. */
const adminAlertEmail = async () => {
    try {
        const { FoodBusinessSettings } = await import('../food/admin/models/businessSettings.model.js');
        const settings = await FoodBusinessSettings.findOne().select('supportEmail').lean();
        return settings?.supportEmail || '';
    } catch {
        return '';
    }
};

/** Only same-site relative paths may be stored as return targets (prevents open redirects through the return page). */
export const sanitizePath = (p) => {
    const s = String(p || '').trim();
    if (!s || s.length > 300) return '';
    if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /[\u0000-\u001f]/.test(s)) return '';
    return s;
};

const eventOf = (type, source, note = '') => ({ at: new Date(), type, source, note: String(note).slice(0, 300) });

/** What the browser needs to continue: which provider, and what to do next (open a pop-up, redirect, ...). */
export const presentPayment = (tx, action) => ({
    transactionId: tx.publicId,
    statusToken: tx.statusToken,
    provider: tx.provider,
    status: tx.status,
    amount: fromMinor(tx.amountMinor, tx.currency),
    amountMinor: tx.amountMinor,
    currency: tx.currency,
    expiresAt: tx.expiresAt,
    action
});

// ─── Starting a payment ──────────────────────────────────────────────────────

export const startPayment = async ({
    purpose, ownerType = '', ownerId = null, amount, currency, country = '', provider: requested = '', description = '',
    customer = {}, language = 'en', returnPath = '', cancelPath = '', refs = {}, metadata = {}
}) => {
    if (!PURPOSES.includes(purpose)) throw new PaymentsError(`Unknown payment purpose "${purpose}"`, 500);
    const amountMinor = toMinor(amount, currency);
    if (!Number.isInteger(amountMinor) || amountMinor < 1) throw new PaymentsError('Invalid payment amount', 400, 'INVALID_AMOUNT');

    const available = await resolveProviders({ country, currency });
    if (!available.length) {
        throw new PaymentsError('No payment method is available for your region right now. Please contact support.', 503, 'NO_PROVIDER');
    }
    let providerId = available[0];
    if (requested) {
        if (!isKnownProvider(requested) || !available.includes(requested)) throw new PaymentsError('That payment method is not available', 400, 'PROVIDER_NOT_AVAILABLE');
        providerId = requested;
    }

    const tx = await PaymentTransaction.create({
        publicId: newPublicId(),
        statusToken: newStatusToken(),
        provider: providerId,
        purpose,
        ownerType,
        ownerId,
        refs,
        amountMinor,
        currency,
        country,
        description: String(description).slice(0, 500),
        customer: { name: customer.name || '', email: customer.email || '', phone: customer.phone || '' },
        language,
        returnPath: sanitizePath(returnPath),
        cancelPath: sanitizePath(cancelPath),
        status: 'created',
        expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000),
        metadata,
        events: [eventOf('created', 'api', providerId)]
    });

    try {
        const result = await getProvider(providerId).createPayment(tx);
        tx.providerOrderId = result.providerOrderId || '';
        tx.providerData = result.providerData || {};
        tx.status = 'pending';
        tx.events.push(eventOf('provider_order_created', 'api', tx.providerOrderId));
        await tx.save();
        return { transaction: tx, payment: presentPayment(tx, result.action) };
    } catch (err) {
        tx.status = 'failed';
        tx.failureReason = String(err?.message || err).slice(0, 300);
        tx.events.push(eventOf('provider_error', 'api', tx.failureReason));
        await tx.save();
        logger.error(`Payment ${tx.publicId} (${providerId}) could not be started: ${tx.failureReason}`);
        throw new PaymentsError('We could not start the payment. Please try again in a moment.', 502, 'PROVIDER_ERROR');
    }
};

// ─── State machine ───────────────────────────────────────────────────────────

const reload = (tx) => PaymentTransaction.findById(tx._id);

/** Runs what was paid for (activate a subscription, credit a wallet, ...) exactly once, even under concurrent webhooks. */
export const fulfil = async (tx) => {
    if (tx.fulfilment?.done) return tx;
    const claimed = await PaymentTransaction.findOneAndUpdate(
        {
            _id: tx._id,
            status: { $in: PAID_LIKE },
            'fulfilment.done': { $ne: true },
            $or: [{ 'fulfilment.lockedAt': null }, { 'fulfilment.lockedAt': { $lt: new Date(Date.now() - FULFIL_LOCK_MS) } }]
        },
        { $set: { 'fulfilment.lockedAt': new Date() }, $inc: { 'fulfilment.attempts': 1 } },
        { new: true }
    );
    if (!claimed) return reload(tx);
    try {
        const outcome = await getPurpose(claimed.purpose).onPaid(claimed);
        const update = {
            $set: { 'fulfilment.done': true, 'fulfilment.at': new Date(), 'fulfilment.lockedAt': null, 'fulfilment.error': '' },
            $push: { events: eventOf(outcome?.attention ? 'needs_attention' : 'fulfilled', 'system', outcome?.attention || '') }
        };
        if (outcome?.attention) {
            update.$addToSet = { flags: 'needs_attention' };
            logger.error(`Payment ${tx.publicId} needs attention: ${outcome.attention}`);
        }
        await PaymentTransaction.updateOne({ _id: tx._id }, update);
        if (claimed.customer?.email) {
            await emailSafe(
                queueEmail({
                    to: claimed.customer.email,
                    subjectKey: 'Payment received',
                    bodyKey: 'Thank you! We have received your payment of {{amount}} {{currency}} for {{description}}. You can see the details any time from the app.',
                    language: claimed.language,
                    vars: paymentVars(claimed)
                }),
                `Payment received email for ${claimed.publicId}`
            );
        }
    } catch (err) {
        logger.error(`Fulfilment of ${tx.publicId} (${tx.purpose}) failed: ${err?.message || err}`);
        await PaymentTransaction.updateOne(
            { _id: tx._id },
            { $set: { 'fulfilment.lockedAt': null, 'fulfilment.error': String(err?.message || err).slice(0, 500) }, $push: { events: eventOf('fulfilment_failed', 'system', err?.message || '') } }
        );
    }
    return reload(tx);
};

const settlePaid = async (tx, result, source) => {
    if (PAID_LIKE.includes(tx.status)) return fulfil(tx);

    const amountOk = result.amountMinor == null || Number(result.amountMinor) === tx.amountMinor;
    const currencyOk = !result.currency || String(result.currency).toUpperCase() === tx.currency;
    if (!amountOk || !currencyOk) {
        const note = `provider reported ${result.amountMinor} ${result.currency}, expected ${tx.amountMinor} ${tx.currency}`;
        logger.error(`Payment ${tx.publicId}: amount/currency mismatch, NOT settled (${note})`);
        await PaymentTransaction.updateOne({ _id: tx._id }, { $addToSet: { flags: 'amount_mismatch' }, $push: { events: eventOf('amount_mismatch', source, note) } });
        return reload(tx);
    }

    const updated = await PaymentTransaction.findOneAndUpdate(
        { _id: tx._id, status: { $in: [...OPEN, 'failed', 'expired', 'cancelled'] } },
        {
            $set: { status: 'paid', paidAt: new Date(), failureReason: '', lastSyncedAt: new Date(), ...(result.providerPaymentId ? { providerPaymentId: String(result.providerPaymentId) } : {}) },
            $push: { events: eventOf('paid', source, result.providerPaymentId || '') }
        },
        { new: true }
    );
    return fulfil(updated || (await reload(tx)));
};

const settleNotPaid = async (tx, state, reason, source) => {
    if (PAID_LIKE.includes(tx.status)) return tx;
    const updated = await PaymentTransaction.findOneAndUpdate(
        { _id: tx._id, status: { $in: OPEN } },
        { $set: { status: state, failureReason: String(reason || '').slice(0, 300), lastSyncedAt: new Date() }, $push: { events: eventOf(state, source, reason || '') } },
        { new: true }
    );
    if (updated) {
        try {
            await getPurpose(updated.purpose).onFailed?.(updated, state);
        } catch (err) {
            logger.warn(`onFailed for ${tx.publicId} threw: ${err?.message || err}`);
        }
        // Only an actual failure, not a quietly abandoned checkout (state "expired") or a customer-cancelled one —
        // those need no email, the customer already knows nothing happened.
        if (state === 'failed') {
            const failReason = updated.failureReason || 'unknown';
            if (updated.customer?.email) {
                await emailSafe(
                    queueEmail({
                        to: updated.customer.email,
                        subjectKey: 'Payment failed',
                        bodyKey: 'We could not process your payment of {{amount}} {{currency}} for {{description}}. Reason: {{reason}}\n\nYou can try again any time from the app.',
                        language: updated.language,
                        vars: paymentVars(updated, { reason: failReason })
                    }),
                    `Payment failed email for ${updated.publicId}`
                );
            }
            const adminTo = await adminAlertEmail();
            if (adminTo) {
                await emailSafe(
                    queueEmail({
                        to: adminTo,
                        subjectKey: 'Payment failed',
                        bodyKey: 'Payment {{publicId}} ({{purpose}}) for {{customerEmail}} failed: {{reason}}. Amount: {{amount}} {{currency}}.',
                        language: 'en',
                        vars: adminVars(updated, { reason: failReason })
                    }),
                    `Admin payment-failed alert for ${updated.publicId}`
                );
            }
        }
    }
    return updated || (await reload(tx));
};

/** Single entry point that folds any provider answer (webhook, browser confirmation, status poll) into our record. */
export const applyProviderResult = async (txOrId, result, source = 'webhook') => {
    const tx = typeof txOrId === 'object' && txOrId?._id ? txOrId : await PaymentTransaction.findById(txOrId);
    if (!tx) return null;
    switch (result?.state) {
        case 'paid':
            return settlePaid(tx, result, source);
        case 'failed':
        case 'expired':
        case 'cancelled':
            return settleNotPaid(tx, result.state, result.reason, source);
        case 'attempt_failed':
            await PaymentTransaction.updateOne({ _id: tx._id }, { $push: { events: eventOf('attempt_failed', source, result.reason || '') } });
            return reload(tx);
        case 'refund_sync': {
            if (!PAID_LIKE.includes(tx.status)) return tx;
            const refunded = Math.min(Number(result.refundedMinor) || 0, tx.amountMinor);
            if (refunded > tx.refundedMinor) {
                const status = refunded >= tx.amountMinor ? 'refunded' : 'partially_refunded';
                await PaymentTransaction.updateOne({ _id: tx._id, refundedMinor: { $lt: refunded } }, { $set: { refundedMinor: refunded, status }, $push: { events: eventOf('refund_synced', source, String(refunded)) } });
            }
            return reload(tx);
        }
        case 'pending':
            await PaymentTransaction.updateOne({ _id: tx._id }, { $set: { lastSyncedAt: new Date(), ...(result.providerPaymentId && !tx.providerPaymentId ? { providerPaymentId: result.providerPaymentId } : {}) } });
            return reload(tx);
        default:
            return tx;
    }
};

/** Asks the provider what happened, in case the webhook is late or could not reach us (e.g. local development). */
export const syncFromProvider = async (tx) => {
    if (!OPEN.includes(tx.status) || tx.provider === 'mock') return tx;
    try {
        const result = await getProvider(tx.provider).getStatus(tx);
        const after = await applyProviderResult(tx, result, 'sync');
        if (after && OPEN.includes(after.status) && after.expiresAt && Date.now() > after.expiresAt.getTime() + 5 * 60_000) {
            return settleNotPaid(after, 'expired', 'Payment window elapsed', 'sync');
        }
        return after;
    } catch (err) {
        logger.warn(`Status sync for ${tx.publicId} failed: ${err?.message || err}`);
        return tx;
    }
};

/** The browser says a Razorpay pop-up finished. The signature and the payment itself are verified before anything changes. */
export const confirmRazorpayPayment = async (tx, body) => {
    if (tx.provider !== 'razorpay') throw new PaymentsError('This payment was not started with Razorpay', 400);
    if (PAID_LIKE.includes(tx.status)) return fulfil(tx);
    let result;
    try {
        result = await getProvider('razorpay').confirmClientPayment(tx, body);
    } catch (err) {
        await PaymentTransaction.updateOne({ _id: tx._id }, { $push: { events: eventOf('client_confirm_rejected', 'client', err.message) } });
        throw new PaymentsError(err.message, 400, 'VERIFICATION_FAILED');
    }
    return applyProviderResult(tx, result, 'client');
};

/** Development-only instant success. Refuses to run unless mock mode is on (never in production). */
export const confirmMockPayment = async (tx) => {
    if (tx.provider !== 'mock') throw new PaymentsError('Not a test payment', 400);
    return applyProviderResult(tx, { state: 'paid', providerPaymentId: `mock_${tx.publicId}`, amountMinor: tx.amountMinor, currency: tx.currency }, 'mock');
};

/**
 * Finds a payment that belongs to `ownerId`. Used by the per-flow "verify" endpoints that older clients still call
 * with only the provider's order id.
 */
export const findOwnedTransaction = async ({ publicId, providerOrderId, purpose, ownerId }) => {
    const filter = { ...(purpose ? { purpose } : {}) };
    if (publicId) filter.publicId = String(publicId);
    else if (providerOrderId) Object.assign(filter, { provider: 'razorpay', providerOrderId: String(providerOrderId) });
    else return null;
    const tx = await PaymentTransaction.findOne(filter);
    if (!tx) return null;
    if (ownerId && String(tx.ownerId) !== String(ownerId)) return null;
    return tx;
};

// ─── Status for the return page ──────────────────────────────────────────────

const tokensMatch = (a, b) => {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

const publicStatus = (tx) => ({
    transactionId: tx.publicId,
    status: PAID_LIKE.includes(tx.status) ? 'paid' : tx.status === 'created' ? 'pending' : tx.status,
    fulfilled: Boolean(tx.fulfilment?.done),
    purpose: tx.purpose,
    provider: tx.provider,
    amount: fromMinor(tx.amountMinor, tx.currency),
    currency: tx.currency,
    returnPath: tx.returnPath,
    cancelPath: tx.cancelPath
});

export const getPublicStatus = async (publicId, token) => {
    let tx = await PaymentTransaction.findOne({ publicId: String(publicId || '') });
    if (!tx || !tokensMatch(tx.statusToken, token)) throw new PaymentsError('Payment not found', 404, 'NOT_FOUND');
    if (OPEN.includes(tx.status) && (!tx.lastSyncedAt || Date.now() - tx.lastSyncedAt.getTime() > 3000)) tx = (await syncFromProvider(tx)) || tx;
    else if (PAID_LIKE.includes(tx.status) && !tx.fulfilment?.done) tx = (await fulfil(tx)) || tx;
    return publicStatus(tx);
};

// ─── Webhooks ────────────────────────────────────────────────────────────────

const findTransaction = async (providerId, lookup = {}) => {
    if (lookup.publicId) {
        const tx = await PaymentTransaction.findOne({ publicId: String(lookup.publicId) });
        if (tx) return tx;
    }
    if (lookup.providerOrderId) {
        const tx = await PaymentTransaction.findOne({ provider: providerId, providerOrderId: String(lookup.providerOrderId) });
        if (tx) return tx;
    }
    if (lookup.providerPaymentId) return PaymentTransaction.findOne({ provider: providerId, providerPaymentId: String(lookup.providerPaymentId) });
    return null;
};

const processEvents = async (providerId, events) => {
    const adapter = getProvider(providerId);
    for (const event of events) {
        if (event.id && (await PaymentWebhookEvent.exists({ provider: providerId, eventId: event.id }))) continue;
        const tx = await findTransaction(providerId, event.lookup);
        if (!tx) {
            logger.warn(`Webhook ${providerId}/${event.type}: no matching payment (${JSON.stringify(event.lookup)})`);
            continue;
        }
        // Already settled: just make sure it was delivered, do not talk to the provider again.
        if (PAID_LIKE.includes(tx.status) && /payment|completed|succeeded|captured/.test(event.type)) {
            await fulfil(tx);
        } else {
            const result = await adapter.resolveEvent(tx, event);
            await applyProviderResult(tx, result, 'webhook');
        }
        if (event.id) {
            try {
                await PaymentWebhookEvent.create({ provider: providerId, eventId: event.id, type: event.type });
            } catch (err) {
                if (err?.code !== 11000) throw err;
            }
        }
    }
};

/** Verifies and applies one webhook delivery. Throws PaymentsError(400) for a bad signature, anything else = retry later. */
export const handleWebhook = async (providerId, req) => {
    const adapter = getProvider(providerId);
    let parsed;
    try {
        parsed = adapter.parseWebhook(req);
    } catch (err) {
        logger.warn(`Rejected ${providerId} webhook: ${err?.message || err}`);
        throw new PaymentsError('Invalid webhook', 400, 'BAD_WEBHOOK');
    }
    await processEvents(providerId, parsed.events || []);
};

/** Razorpay's webhook is verified by the pre-existing controller; this applies its events to the new payment records. */
export const handleRazorpayEvents = async (body) => {
    const events = getProvider('razorpay').eventsFromWebhookBody(body);
    if (events.length) await processEvents('razorpay', events);
};

// ─── Refunds ─────────────────────────────────────────────────────────────────

export const refundTransaction = async (publicId, { amount, reason = '', actor = '' } = {}) => {
    const tx = await PaymentTransaction.findOne({ publicId });
    if (!tx) throw new PaymentsError('Payment not found', 404, 'NOT_FOUND');
    if (!PAID_LIKE.includes(tx.status)) throw new PaymentsError('Only paid payments can be refunded', 400, 'NOT_REFUNDABLE');
    if (tx.purpose === 'wallet_topup') throw new PaymentsError('Wallet top-ups cannot be refunded to the original payment method', 400, 'NOT_REFUNDABLE');
    if (tx.provider === 'mock') throw new PaymentsError('Test payments cannot be refunded', 400, 'NOT_REFUNDABLE');
    const provider = getProvider(tx.provider);
    if (typeof provider.refund !== 'function') throw new PaymentsError('This provider does not support refunds', 400);

    const refundable = tx.amountMinor - tx.refundedMinor;
    const amountMinor = amount === undefined || amount === null || amount === '' ? refundable : toMinor(amount, tx.currency);
    if (!Number.isInteger(amountMinor) || amountMinor < 1 || amountMinor > refundable) {
        throw new PaymentsError(`Refund must be between 0.01 and ${fromMinor(refundable, tx.currency)} ${tx.currency}`, 400, 'INVALID_AMOUNT');
    }

    const refundKey = crypto.randomUUID();
    // Reserve the amount atomically so two admins cannot refund the same money twice.
    const reserved = await PaymentTransaction.findOneAndUpdate(
        { _id: tx._id, refundedMinor: tx.refundedMinor },
        { $inc: { refundedMinor: amountMinor }, $push: { refunds: { refundKey, amountMinor, status: 'pending', reason: String(reason).slice(0, 300), requestedBy: String(actor) }, events: eventOf('refund_requested', 'admin', `${amountMinor}`) } },
        { new: true }
    );
    if (!reserved) throw new PaymentsError('This payment was changed by someone else, please reload and try again', 409, 'CONFLICT');

    try {
        const out = await provider.refund(tx, amountMinor, reason, refundKey);
        const total = reserved.refundedMinor;
        await PaymentTransaction.updateOne(
            { _id: tx._id, 'refunds.refundKey': refundKey },
            { $set: { 'refunds.$.status': out.status, 'refunds.$.providerRefundId': out.providerRefundId || '', status: total >= tx.amountMinor ? 'refunded' : 'partially_refunded' } }
        );
        const refunded = await reload(tx);
        // Amendment 1 #12: a refunded B2B VAT invoice gets a credit note (best effort, never undoes the refund).
        if (out.status !== 'failed') {
            const { issueCreditNoteForRefund } = await import('../dailymealbox/billing/creditNote.service.js');
            await issueCreditNoteForRefund({ tx: refunded, amountMinor, refundKey, reason, actor });
        }
        const refundedAmount = fromMinor(amountMinor, tx.currency).toFixed(2);
        const refundReason = String(reason || 'not given');
        if (refunded.customer?.email) {
            await emailSafe(
                queueEmail({
                    to: refunded.customer.email,
                    subjectKey: 'Refund issued',
                    bodyKey: "We've refunded {{refundedAmount}} {{currency}} for {{description}} to your original payment method. It can take a few days to appear, depending on your bank.",
                    language: refunded.language,
                    vars: paymentVars(refunded, { refundedAmount })
                }),
                `Refund issued email for ${refunded.publicId}`
            );
        }
        const adminTo = await adminAlertEmail();
        if (adminTo) {
            await emailSafe(
                queueEmail({
                    to: adminTo,
                    subjectKey: 'Refund issued',
                    bodyKey: 'Payment {{publicId}} ({{purpose}}) for {{customerEmail}} was refunded {{refundedAmount}} {{currency}}. Reason: {{reason}}.',
                    language: 'en',
                    vars: adminVars(refunded, { refundedAmount, reason: refundReason })
                }),
                `Admin refund alert for ${refunded.publicId}`
            );
        }
        return refunded;
    } catch (err) {
        await PaymentTransaction.updateOne(
            { _id: tx._id, 'refunds.refundKey': refundKey },
            { $inc: { refundedMinor: -amountMinor }, $set: { 'refunds.$.status': 'failed', 'refunds.$.error': String(err?.message || err).slice(0, 300) } }
        );
        throw new PaymentsError(`The provider rejected the refund: ${err?.message || err}`, 502, 'REFUND_FAILED');
    }
};

// ─── Background upkeep ───────────────────────────────────────────────────────

/** Settles payments whose webhook never arrived, and expires abandoned ones. */
export const reconcilePending = async ({ limit = 100 } = {}) => {
    const rows = await PaymentTransaction.find({ status: { $in: OPEN }, provider: { $ne: 'mock' }, createdAt: { $gt: new Date(Date.now() - 7 * 24 * 3600 * 1000), $lt: new Date(Date.now() - 60_000) } })
        .sort({ createdAt: 1 })
        .limit(limit);
    let settled = 0;
    for (const tx of rows) {
        const after = await syncFromProvider(tx);
        if (after && !OPEN.includes(after.status)) settled++;
    }
    return { checked: rows.length, settled };
};

/** Delivers paid orders whose first delivery attempt failed (e.g. a database blip). */
export const retryUnfulfilled = async ({ limit = 100 } = {}) => {
    const rows = await PaymentTransaction.find({ status: { $in: PAID_LIKE }, 'fulfilment.done': { $ne: true }, paidAt: { $lt: new Date(Date.now() - 30_000) } }).limit(limit);
    let delivered = 0;
    for (const tx of rows) {
        const after = await fulfil(tx);
        if (after?.fulfilment?.done) delivered++;
    }
    return { checked: rows.length, delivered };
};

let jobTimer = null;
export const startPaymentsJobs = ({ everyMs = 60_000 } = {}) => {
    if (jobTimer || process.env.PAYMENTS_JOBS === 'false') return;
    jobTimer = setInterval(async () => {
        try {
            await reconcilePending();
            await retryUnfulfilled();
        } catch (err) {
            logger.warn(`Payments upkeep failed: ${err?.message || err}`);
        }
    }, everyMs);
    jobTimer.unref?.();
};
export const stopPaymentsJobs = () => {
    if (jobTimer) clearInterval(jobTimer);
    jobTimer = null;
};
