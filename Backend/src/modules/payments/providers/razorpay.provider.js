import crypto from 'crypto';
import Razorpay from 'razorpay';
import { razorpayConfig } from '../payments.config.js';
import { logger } from '../../../utils/logger.js';

/**
 * Razorpay (INR only). The customer pays inside a Razorpay pop-up; the browser hands us the signed result and
 * Razorpay's webhook confirms it independently, so a closed tab never loses a paid order.
 */

let clientOverride = null;
/** Tests replace the Razorpay SDK client (it only talks to api.razorpay.com). */
export const _setRazorpayClientForTests = (factory) => {
    clientOverride = factory;
};

const client = () => {
    if (clientOverride) return clientOverride();
    const c = razorpayConfig();
    return new Razorpay({ key_id: c.keyId, key_secret: c.keySecret });
};

/**
 * The Razorpay SDK rejects with a plain object ({ statusCode, error: { code, description, field } }), not an Error,
 * so `err.message` is empty and logs end up as "[object Object]". Turn it into a real Error with the real reason.
 */
const asError = (err) => {
    if (err instanceof Error) return err;
    const e = err?.error || {};
    const parts = [e.description || err?.message, e.code && `code=${e.code}`, e.field && `field=${e.field}`, err?.statusCode && `http=${err.statusCode}`].filter(Boolean);
    const out = new Error(parts.join(' | ') || 'Razorpay request failed');
    out.statusCode = err?.statusCode;
    out.razorpay = e;
    return out;
};

const safeEqual = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const razorpayProvider = {
    id: 'razorpay',
    label: 'Razorpay',
    supportsCurrency: (currency) => String(currency).toUpperCase() === 'INR',
    isConfigured() {
        const c = razorpayConfig();
        return Boolean(c.keyId && c.keySecret);
    },
    mode: () => (razorpayConfig().keyId.startsWith('rzp_live') ? 'live' : 'test'),

    async createPayment(tx) {
        const order = await client().orders.create({
            amount: tx.amountMinor,
            currency: tx.currency,
            receipt: tx.publicId,
            notes: { txId: tx.publicId, purpose: tx.purpose }
        }).catch((err) => { throw asError(err); });
        return {
            providerOrderId: order.id,
            providerData: { orderId: order.id },
            action: {
                type: 'razorpay',
                key: razorpayConfig().keyId,
                orderId: order.id,
                amount: tx.amountMinor,
                currency: tx.currency,
                name: 'DailyMealBox',
                description: tx.description || ''
            }
        };
    },

    /**
     * The browser reports a finished payment. Trust nothing from it except the signature, then ask Razorpay for the
     * payment itself so the amount, currency and order are checked against OUR record.
     */
    async confirmClientPayment(tx, body) {
        const orderId = String(body?.razorpay_order_id || body?.razorpayOrderId || '');
        const paymentId = String(body?.razorpay_payment_id || body?.razorpayPaymentId || '');
        const signature = String(body?.razorpay_signature || body?.razorpaySignature || '');
        if (!orderId || !paymentId || !signature) throw new Error('razorpay_order_id, razorpay_payment_id and razorpay_signature are required');
        if (orderId !== tx.providerOrderId) throw new Error('Payment does not belong to this order');

        const expected = crypto.createHmac('sha256', razorpayConfig().keySecret).update(`${orderId}|${paymentId}`).digest('hex');
        if (!safeEqual(expected, signature)) throw new Error('Payment verification failed: invalid signature');

        try {
            const payment = await client().payments.fetch(paymentId).catch((err) => { throw asError(err); });
            if (payment.order_id !== tx.providerOrderId) throw new Error('Payment belongs to a different order');
            if (!['captured', 'authorized'].includes(payment.status)) return { state: 'pending', providerPaymentId: paymentId, reason: `payment status ${payment.status}` };
            return { state: 'paid', providerPaymentId: paymentId, amountMinor: Number(payment.amount), currency: String(payment.currency).toUpperCase(), raw: { method: payment.method } };
        } catch (err) {
            if (/different order/.test(err.message)) throw err;
            // Razorpay's API is unreachable but the signature is valid: accept it, the amount is fixed by our own order.
            logger.warn(`Razorpay payment fetch failed for ${tx.publicId}; accepting signed result: ${err?.message || err}`);
            return { state: 'paid', providerPaymentId: paymentId, amountMinor: tx.amountMinor, currency: tx.currency };
        }
    },

    async getStatus(tx) {
        if (!tx.providerOrderId) return { state: 'pending' };
        const list = await client().orders.fetchPayments(tx.providerOrderId).catch((err) => { throw asError(err); });
        const items = list?.items || [];
        const captured = items.find((p) => p.status === 'captured');
        if (captured) return { state: 'paid', providerPaymentId: captured.id, amountMinor: Number(captured.amount), currency: String(captured.currency).toUpperCase() };
        if (items.length && items.every((p) => p.status === 'failed')) return { state: 'pending', reason: 'last attempt failed' };
        return { state: 'pending' };
    },

    /** Called from the existing Razorpay webhook after its signature has been verified. */
    eventsFromWebhookBody(body) {
        const event = body?.event;
        const paymentEntity = body?.payload?.payment?.entity;
        if (event === 'payment.captured' && paymentEntity) {
            return [{ id: `${event}:${paymentEntity.id}`, type: event, lookup: { providerOrderId: paymentEntity.order_id }, data: paymentEntity }];
        }
        if (event === 'payment.failed' && paymentEntity) {
            return [{ id: `${event}:${paymentEntity.id}`, type: event, lookup: { providerOrderId: paymentEntity.order_id }, data: paymentEntity }];
        }
        if (event === 'refund.processed') {
            const refund = body?.payload?.refund?.entity;
            if (refund) return [{ id: `${event}:${refund.id}`, type: event, lookup: { providerPaymentId: refund.payment_id }, data: refund }];
        }
        return [];
    },

    async resolveEvent(tx, event) {
        const d = event.data;
        if (event.type === 'payment.captured') {
            return { state: 'paid', providerPaymentId: d.id, amountMinor: Number(d.amount), currency: String(d.currency).toUpperCase() };
        }
        if (event.type === 'payment.failed') return { state: 'attempt_failed', reason: d.error_description || 'Payment attempt failed' };
        if (event.type === 'refund.processed') return { state: 'refund_sync', refundedMinor: Number(d.amount) || 0 };
        return { state: 'ignored' };
    },

    async refund(tx, amountMinor, reason) {
        const refund = await client().payments.refund(tx.providerPaymentId, { amount: amountMinor, notes: { reason: String(reason || '').slice(0, 250), txId: tx.publicId } }).catch((err) => { throw asError(err); });
        return { providerRefundId: refund.id, status: refund.status === 'failed' ? 'failed' : 'processed' };
    },

    async testConnection() {
        if (!this.isConfigured()) return { ok: false, message: 'Credentials missing (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)' };
        try {
            await client().orders.all({ count: 1 });
            return { ok: true, message: `Connected to Razorpay (${this.mode()} mode)` };
        } catch (err) {
            return { ok: false, message: err?.error?.description || err?.message || 'Razorpay rejected the keys' };
        }
    }
};
