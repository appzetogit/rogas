import Stripe from 'stripe';
import { stripeConfig, appPublicUrl } from '../payments.config.js';

/**
 * Stripe Checkout (hosted page). Payment methods shown to the customer (cards, Apple/Google Pay, and for Polish
 * customers BLIK/Przelewy24 when enabled) are managed in the Stripe dashboard, so adding a method needs no deploy.
 */

// Locales Stripe Checkout can render; everything else uses the browser language.
const STRIPE_LOCALES = new Set(['bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'ms', 'mt', 'nb', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'vi']);
const PAYMENT_WINDOW_SECONDS = 31 * 60; // Stripe requires at least 30 minutes

let cached = { key: '', client: null };
export const getStripe = () => {
    const cfg = stripeConfig();
    if (!cfg.secretKey) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY)');
    const cacheKey = `${cfg.secretKey}|${cfg.apiHost}|${cfg.apiPort}`;
    if (cached.key !== cacheKey) {
        const options = { maxNetworkRetries: 2, timeout: 20000 };
        if (cfg.apiHost) {
            options.host = cfg.apiHost;
            options.protocol = cfg.apiProtocol || 'http';
            if (cfg.apiPort) options.port = cfg.apiPort;
        }
        cached = { key: cacheKey, client: new Stripe(cfg.secretKey, options) };
    }
    return cached.client;
};

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));

const sessionResult = (session) => {
    const providerPaymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '';
    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
        return { state: 'paid', providerPaymentId, amountMinor: session.amount_total, currency: String(session.currency).toUpperCase(), raw: { sessionId: session.id } };
    }
    if (session.status === 'expired') return { state: 'expired' };
    return { state: 'pending', providerPaymentId };
};

export const stripeProvider = {
    id: 'stripe',
    label: 'Stripe',
    supportsCurrency: () => true,
    isConfigured: () => Boolean(stripeConfig().secretKey),
    mode() {
        const key = stripeConfig().secretKey;
        return key.startsWith('sk_live') || key.startsWith('rk_live') ? 'live' : 'test';
    },

    async createPayment(tx) {
        const stripe = getStripe();
        const lang = String(tx.language || '').slice(0, 2).toLowerCase();
        const returnBase = `${appPublicUrl()}/payment/return?tx=${tx.publicId}&t=${tx.statusToken}`;
        const session = await stripe.checkout.sessions.create(
            {
                mode: 'payment',
                client_reference_id: tx.publicId,
                ...(validEmail(tx.customer?.email) ? { customer_email: tx.customer.email } : {}),
                line_items: [
                    {
                        quantity: 1,
                        price_data: {
                            currency: tx.currency.toLowerCase(),
                            unit_amount: tx.amountMinor,
                            product_data: { name: String(tx.description || 'DailyMealBox').slice(0, 250) }
                        }
                    }
                ],
                success_url: `${returnBase}`,
                cancel_url: `${returnBase}&cancelled=1`,
                expires_at: Math.floor(Date.now() / 1000) + PAYMENT_WINDOW_SECONDS,
                locale: STRIPE_LOCALES.has(lang) ? lang : 'auto',
                metadata: { txId: tx.publicId, purpose: tx.purpose },
                payment_intent_data: { description: String(tx.description || '').slice(0, 250), metadata: { txId: tx.publicId, purpose: tx.purpose } }
            },
            { idempotencyKey: `create-${tx.publicId}` }
        );
        if (!session?.url) throw new Error('Stripe did not return a checkout URL');
        return { providerOrderId: session.id, providerData: { sessionId: session.id }, action: { type: 'redirect', url: session.url } };
    },

    async getStatus(tx) {
        if (!tx.providerOrderId) return { state: 'pending' };
        const session = await getStripe().checkout.sessions.retrieve(tx.providerOrderId);
        return sessionResult(session);
    },

    /** Verifies the Stripe-Signature header against the raw body and returns the events to process. */
    parseWebhook(req) {
        const cfg = stripeConfig();
        if (!cfg.webhookSecret) throw new Error('Stripe webhook secret is not configured');
        const signature = req.headers['stripe-signature'];
        if (!signature || !req.rawBody) throw new Error('Missing Stripe signature');
        const event = getStripe().webhooks.constructEvent(req.rawBody, signature, cfg.webhookSecret);
        const obj = event.data?.object || {};
        const base = { id: event.id, type: event.type, data: obj };
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
            case 'checkout.session.async_payment_failed':
            case 'checkout.session.expired':
                return { events: [{ ...base, lookup: { publicId: obj.client_reference_id || obj.metadata?.txId, providerOrderId: obj.id } }] };
            case 'charge.refunded':
                return { events: [{ ...base, lookup: { providerPaymentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id } }] };
            default:
                return { events: [] };
        }
    },

    async resolveEvent(tx, event) {
        const obj = event.data;
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
                return sessionResult({ ...obj, payment_status: event.type === 'checkout.session.async_payment_succeeded' ? 'paid' : obj.payment_status });
            case 'checkout.session.async_payment_failed':
                return { state: 'failed', reason: 'The payment method declined the payment' };
            case 'checkout.session.expired':
                return { state: 'expired' };
            case 'charge.refunded':
                return { state: 'refund_sync', refundedMinor: Number(obj.amount_refunded) || 0 };
            default:
                return { state: 'ignored' };
        }
    },

    async refund(tx, amountMinor, reason, refundKey) {
        if (!tx.providerPaymentId) throw new Error('This payment has no Stripe PaymentIntent yet');
        const refund = await getStripe().refunds.create(
            { payment_intent: tx.providerPaymentId, amount: amountMinor, metadata: { txId: tx.publicId, reason: String(reason || '').slice(0, 400) } },
            { idempotencyKey: `refund-${refundKey}` }
        );
        return { providerRefundId: refund.id, status: refund.status === 'failed' ? 'failed' : refund.status === 'succeeded' ? 'processed' : 'pending' };
    },

    async testConnection() {
        if (!this.isConfigured()) return { ok: false, message: 'Credentials missing (STRIPE_SECRET_KEY)' };
        try {
            const balance = await getStripe().balance.retrieve();
            return { ok: true, message: `Connected to Stripe (${this.mode()} mode${balance?.livemode ? ', live' : ''})` };
        } catch (err) {
            return { ok: false, message: err?.message || 'Stripe rejected the key' };
        }
    }
};
