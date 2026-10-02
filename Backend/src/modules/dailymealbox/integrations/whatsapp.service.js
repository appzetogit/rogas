import mongoose from 'mongoose';
import { getIntegrationConfig, markIntegrationChecked } from './integrations.js';
import { isEnabled } from '../platform/platformConfig.service.js';
import { safeDecrypt, encryptField } from '../../../utils/fieldCrypto.js';
import { logger } from '../../../utils/logger.js';

/**
 * WhatsApp invoice delivery (Gap J, ACM-156) through the WhatsApp Business API, via Twilio or 360dialog.
 *
 * Business-initiated WhatsApp messages need a pre-approved template. Configure one in the provider with a *document*
 * header (the invoice PDF) and one body variable (the invoice number):
 *   Twilio → contentSid (Content API template); 360dialog → templateName + templateLanguage.
 * Without a template the message is sent as a session message (works only within 24h of the customer writing to you).
 * The PDF link is a signed, expiring URL the provider fetches (needs API_PUBLIC_URL).
 */

const logSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', index: true },
        subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBSubscription', default: null },
        to: { type: String, default: '' }, // encrypted
        provider: { type: String, default: '' },
        kind: { type: String, default: 'invoice' },
        caption: { type: String, default: '' },
        documentUrl: { type: String, default: '' },
        filename: { type: String, default: '' },
        status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued', index: true },
        providerMessageId: { type: String, default: '' },
        attempts: { type: Number, default: 0 },
        lastError: { type: String, default: '' },
        nextAttemptAt: { type: Date, default: () => new Date() },
        sentAt: { type: Date, default: null }
    },
    { collection: 'dmb_whatsapp_logs', timestamps: true }
);
logSchema.index({ status: 1, nextAttemptAt: 1 });
export const DMBWhatsAppLog = mongoose.models.DMBWhatsAppLog || mongoose.model('DMBWhatsAppLog', logSchema);

const toForm = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')).toString();

const post = async (url, { headers = {}, body, form, timeoutMs = 20000 }) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded', ...headers } : { 'Content-Type': 'application/json', ...headers },
            body: form ? toForm(form) : JSON.stringify(body),
            signal: controller.signal
        });
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* plain text */ }
        if (!res.ok) throw new Error(`WhatsApp provider error ${res.status}: ${json?.message || json?.error?.message || text.slice(0, 200)}`);
        return json || {};
    } finally {
        clearTimeout(t);
    }
};

/** Low-level send. Returns { provider, messageId }. Exported for the admin "send test" button. */
export const sendWhatsAppDocument = async ({ to, caption, documentUrl, filename, variables = {} }, cfg = null) => {
    const conf = cfg || (await getIntegrationConfig('whatsapp'));
    const number = String(to || '').replace(/[^\d+]/g, '');
    if (!/^\+\d{8,15}$/.test(number)) throw new Error('Invalid WhatsApp number');
    if (conf.provider === '360dialog') {
        if (!conf.apiKey) throw new Error('360dialog API key is not configured');
        const body = conf.templateName
            ? {
                messaging_product: 'whatsapp', recipient_type: 'individual', to: number.slice(1), type: 'template',
                template: {
                    name: conf.templateName, language: { code: conf.templateLanguage || 'pl' },
                    components: [
                        { type: 'header', parameters: [{ type: 'document', document: { link: documentUrl, filename } }] },
                        { type: 'body', parameters: [{ type: 'text', text: String(variables.invoiceNumber || filename || '') }] }
                    ]
                }
            }
            : { messaging_product: 'whatsapp', recipient_type: 'individual', to: number.slice(1), type: 'document', document: { link: documentUrl, filename, caption } };
        const res = await post('https://waba-v2.360dialog.io/messages', { headers: { 'D360-API-KEY': conf.apiKey }, body });
        return { provider: '360dialog', messageId: res?.messages?.[0]?.id || '' };
    }
    if (!conf.accountSid || !conf.authToken || !conf.fromNumber) throw new Error('Twilio WhatsApp is not fully configured (account SID, auth token, sender number)');
    const auth = Buffer.from(`${conf.accountSid}:${conf.authToken}`).toString('base64');
    const form = conf.contentSid
        ? { From: `whatsapp:${conf.fromNumber.replace(/^whatsapp:/, '')}`, To: `whatsapp:${number}`, ContentSid: conf.contentSid, ContentVariables: JSON.stringify({ 1: String(variables.invoiceNumber || filename || ''), 2: documentUrl }) }
        : { From: `whatsapp:${conf.fromNumber.replace(/^whatsapp:/, '')}`, To: `whatsapp:${number}`, Body: caption, MediaUrl: documentUrl };
    const res = await post(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(conf.accountSid)}/Messages.json`, { headers: { Authorization: `Basic ${auth}` }, form });
    return { provider: 'twilio', messageId: res?.sid || '' };
};

const attempt = async (log) => {
    try {
        const res = await sendWhatsAppDocument({ to: safeDecrypt(log.to), caption: log.caption, documentUrl: log.documentUrl, filename: log.filename, variables: { invoiceNumber: log.filename.replace(/\.pdf$/, '') } });
        await DMBWhatsAppLog.updateOne({ _id: log._id }, { $set: { status: 'sent', sentAt: new Date(), provider: res.provider, providerMessageId: res.messageId, lastError: '' }, $inc: { attempts: 1 } });
        await markIntegrationChecked('whatsapp', true);
        return true;
    } catch (err) {
        const attempts = (log.attempts || 0) + 1;
        await DMBWhatsAppLog.updateOne({ _id: log._id }, { $set: { status: 'failed', lastError: String(err.message).slice(0, 300), nextAttemptAt: new Date(Date.now() + attempts * 15 * 60_000) }, $inc: { attempts: 1 } });
        logger.warn(`[whatsapp] send failed (${log._id}): ${err.message}`);
        return false;
    }
};

/**
 * Sends a subscription's invoice to the customer on WhatsApp when they chose it (and ACM-156 is on).
 * Returns { queued: boolean }. Never throws.
 */
export const sendInvoiceOnWhatsApp = async ({ userId, subscription }) => {
    try {
        if (!(await isEnabled('whatsappInvoices', { zoneId: subscription.zoneId }))) return { queued: false, reason: 'disabled' };
        const { FoodUser } = await import('../../../core/users/user.model.js');
        const user = await FoodUser.findById(userId).select('whatsappNumber invoiceDeliveryMethod').lean();
        if (!['whatsapp', 'both'].includes(user?.invoiceDeliveryMethod) || !user?.whatsappNumber) return { queued: false, reason: 'not_chosen' };
        const { signInvoiceLink } = await import('../../food/user/services/invoice.service.js');
        const { url } = signInvoiceLink(String(subscription._id), String(userId));
        const log = await DMBWhatsAppLog.create({
            userId, subscriptionId: subscription._id,
            to: user.whatsappNumber.startsWith('enc:') ? user.whatsappNumber : encryptField(user.whatsappNumber),
            caption: `DailyMealBox invoice INV-${subscription.subscriptionId}`,
            documentUrl: url, filename: `INV-${subscription.subscriptionId}.pdf`
        });
        await attempt(log.toObject());
        return { queued: true };
    } catch (err) {
        logger.warn(`[whatsapp] invoice for ${subscription?.subscriptionId} not sent: ${err.message}`);
        return { queued: false, reason: err.message };
    }
};

/** Job: retry failed sends (max 3 attempts). */
export const retryFailedWhatsApp = async () => {
    const due = await DMBWhatsAppLog.find({ status: 'failed', attempts: { $lt: 3 }, nextAttemptAt: { $lte: new Date() } }).limit(50).lean();
    let sent = 0;
    for (const log of due) if (await attempt(log)) sent++;
    return { retried: due.length, sent };
};

export const recentWhatsAppLogs = async (limit = 50) => {
    const rows = await DMBWhatsAppLog.find({}).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).lean();
    return rows.map((r) => ({ ...r, to: `•••• ${safeDecrypt(r.to).slice(-3)}` }));
};
