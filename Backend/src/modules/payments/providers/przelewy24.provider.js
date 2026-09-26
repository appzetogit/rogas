import crypto from 'crypto';
import { p24Config, apiPublicUrl, appPublicUrl, PAYMENT_WINDOW_MINUTES } from '../payments.config.js';
import { requestJson, ProviderHttpError } from './http.js';

/**
 * Przelewy24 (REST API v1).
 *
 * Flow: register a transaction -> redirect the customer to the P24 page -> P24 posts a notification to urlStatus ->
 * we verify its signature, then confirm the transaction with PUT /transaction/verify (money is only ours once that call
 * succeeds). Every signature is SHA-384 over a JSON document that ends with the merchant's CRC key.
 */

export const P24_CURRENCIES = ['PLN', 'EUR', 'CZK', 'GBP', 'HUF'];
// Languages the P24 payment page can be shown in; anything else falls back to English.
const P24_LANGUAGES = new Set(['bg', 'cs', 'de', 'en', 'es', 'fr', 'hr', 'hu', 'it', 'nl', 'pl', 'pt', 'ro', 'sk', 'se']);

export const p24Sign = (fields, crc) => crypto.createHash('sha384').update(JSON.stringify({ ...fields, crc })).digest('hex');

const safeEqual = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const auth = (cfg) => ({ Authorization: `Basic ${Buffer.from(`${cfg.posId}:${cfg.apiKey}`).toString('base64')}` });
const api = (cfg, path) => `${cfg.baseUrl}/api/v1${path}`;

const fallbackEmail = () => process.env.PAYMENTS_FALLBACK_EMAIL || 'payments@dailymealbox.com';
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));

export const przelewy24Provider = {
    id: 'przelewy24',
    label: 'Przelewy24',
    supportsCurrency: (currency) => P24_CURRENCIES.includes(String(currency).toUpperCase()),
    isConfigured() {
        const c = p24Config();
        return Boolean(c.merchantId && c.posId && c.crc && c.apiKey);
    },
    mode: () => (p24Config().sandbox ? 'sandbox' : 'live'),

    async createPayment(tx) {
        const cfg = p24Config();
        const lang = String(tx.language || 'en').slice(0, 2).toLowerCase();
        const returnUrl = `${appPublicUrl()}/payment/return?tx=${tx.publicId}&t=${tx.statusToken}`;
        const fields = {
            merchantId: cfg.merchantId,
            posId: cfg.posId,
            sessionId: tx.publicId,
            amount: tx.amountMinor,
            currency: tx.currency,
            description: String(tx.description || `Order ${tx.publicId}`).slice(0, 1000),
            email: validEmail(tx.customer?.email) ? tx.customer.email : fallbackEmail(),
            country: (tx.country || 'PL').toUpperCase(),
            language: P24_LANGUAGES.has(lang) ? lang : 'en',
            urlReturn: returnUrl,
            urlStatus: `${apiPublicUrl()}/api/v1/payments/webhook/przelewy24`,
            timeLimit: PAYMENT_WINDOW_MINUTES,
            waitForResult: true,
            encoding: 'UTF-8'
        };
        const body = { ...fields, sign: p24Sign({ sessionId: fields.sessionId, merchantId: fields.merchantId, amount: fields.amount, currency: fields.currency }, cfg.crc) };
        const res = await requestJson(api(cfg, '/transaction/register'), { method: 'POST', headers: auth(cfg), body });
        const token = res?.data?.token;
        if (!token) throw new ProviderHttpError('Przelewy24 did not return a payment token');
        return {
            providerOrderId: tx.publicId,
            providerData: { token },
            action: { type: 'redirect', url: `${cfg.baseUrl}/trnRequest/${token}` }
        };
    },

    /** PUT /transaction/verify: the call that makes the payment final. */
    async verifyTransaction(tx, orderId) {
        const cfg = p24Config();
        const fields = { sessionId: tx.publicId, orderId: Number(orderId), amount: tx.amountMinor, currency: tx.currency };
        await requestJson(api(cfg, '/transaction/verify'), {
            method: 'PUT',
            headers: auth(cfg),
            body: { merchantId: cfg.merchantId, posId: cfg.posId, ...fields, sign: p24Sign(fields, cfg.crc) }
        });
    },

    /** Asks P24 what happened to this session. Used by the return page and the background reconciler. */
    async getStatus(tx) {
        const cfg = p24Config();
        let data;
        try {
            const res = await requestJson(api(cfg, `/transaction/by/sessionId/${encodeURIComponent(tx.publicId)}`), { headers: auth(cfg) });
            data = res?.data;
        } catch (err) {
            // 404: the customer never reached the payment page / nothing was paid yet.
            if (err instanceof ProviderHttpError && err.status === 404) return { state: 'pending' };
            throw err;
        }
        if (!data) return { state: 'pending' };
        const orderId = data.orderId;
        const status = Number(data.status);
        if (status === 2 || status === 3) {
            return { state: 'paid', providerPaymentId: String(orderId), amountMinor: Number(data.amount), currency: data.currency, raw: data };
        }
        if (status === 1) {
            try {
                await this.verifyTransaction(tx, orderId);
                return { state: 'paid', providerPaymentId: String(orderId), amountMinor: Number(data.amount), currency: data.currency, raw: data };
            } catch (err) {
                return { state: 'pending', reason: `verify pending: ${err.message}` };
            }
        }
        return { state: 'pending' };
    },

    /** Validates a notification POSTed to urlStatus. Throws when the signature is wrong. */
    parseWebhook(req) {
        const cfg = p24Config();
        const raw = req.rawBody ? req.rawBody.toString('utf8') : null;
        let body = null;
        try {
            body = raw ? JSON.parse(raw) : req.body;
        } catch {
            throw new Error('Invalid Przelewy24 notification body');
        }
        if (!body || typeof body !== 'object') throw new Error('Empty Przelewy24 notification');

        if (body.refundsUuid) {
            return { events: [{ id: `refund:${body.refundsUuid}:${body.orderId}`, type: 'p24.refund', lookup: { publicId: body.sessionId }, data: body }] };
        }

        const expected = p24Sign({
            merchantId: body.merchantId, posId: body.posId, sessionId: body.sessionId, amount: body.amount, originAmount: body.originAmount,
            currency: body.currency, orderId: body.orderId, methodId: body.methodId, statement: body.statement
        }, cfg.crc);
        if (!body.sign || !safeEqual(expected, body.sign)) throw new Error('Przelewy24 notification signature mismatch');
        if (Number(body.merchantId) !== cfg.merchantId) throw new Error('Przelewy24 notification for another merchant');

        return { events: [{ id: `payment:${body.sessionId}:${body.orderId}`, type: 'p24.payment', lookup: { publicId: body.sessionId }, data: body }] };
    },

    /** Turns a verified event into a payment result (this is where the confirmation call to P24 happens). */
    async resolveEvent(tx, event) {
        if (event.type === 'p24.refund') return { state: 'ignored', note: 'refund notification' };
        const n = event.data;
        if (Number(n.amount) !== tx.amountMinor || String(n.currency).toUpperCase() !== tx.currency) {
            return { state: 'paid', providerPaymentId: String(n.orderId), amountMinor: Number(n.amount), currency: String(n.currency).toUpperCase(), unverified: true };
        }
        await this.verifyTransaction(tx, n.orderId);
        return { state: 'paid', providerPaymentId: String(n.orderId), amountMinor: Number(n.amount), currency: String(n.currency).toUpperCase(), raw: n };
    },

    async refund(tx, amountMinor, reason, refundKey) {
        const cfg = p24Config();
        const orderId = Number(tx.providerPaymentId);
        if (!orderId) throw new Error('This payment has no Przelewy24 order id yet');
        const res = await requestJson(api(cfg, '/transaction/refund'), {
            method: 'POST',
            headers: auth(cfg),
            body: {
                requestId: refundKey,
                refunds: [{ orderId, sessionId: tx.publicId, amount: amountMinor, description: String(reason || 'Refund').slice(0, 35) }],
                refundsUuid: refundKey,
                urlStatus: `${apiPublicUrl()}/api/v1/payments/webhook/przelewy24`
            }
        });
        const item = Array.isArray(res?.data) ? res.data[0] : null;
        if (item && item.status === false) throw new Error(item.message || 'Przelewy24 rejected the refund');
        return { providerRefundId: refundKey, status: 'processed' };
    },

    async testConnection() {
        const cfg = p24Config();
        if (!this.isConfigured()) return { ok: false, message: 'Credentials missing (P24_MERCHANT_ID, P24_POS_ID, P24_CRC, P24_API_KEY)' };
        try {
            const res = await requestJson(api(cfg, '/testAccess'), { headers: auth(cfg) });
            return res?.data === true
                ? { ok: true, message: `Connected to Przelewy24 ${cfg.sandbox ? 'sandbox' : 'live'} (POS ${cfg.posId})` }
                : { ok: false, message: 'Przelewy24 rejected the credentials' };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    }
};
