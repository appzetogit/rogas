import crypto from 'crypto';
import mongoose from 'mongoose';
import { getIntegrationConfig, markIntegrationChecked } from './integrations.js';
import { isEnabled } from '../platform/platformConfig.service.js';
import { logger } from '../../../utils/logger.js';

/**
 * Mailchimp audience sync (Gap I, ACM-155). GDPR: only customers with marketingEmailConsent.granted are subscribed;
 * customers who withdrew consent since the last run are set to "unsubscribed" in Mailchimp. Tags: active, churned,
 * trial, b2b, plus the names of the customer's segments (Gap Y).
 */

const stateSchema = new mongoose.Schema(
    {
        _id: { type: String, default: 'mailchimp' },
        lastRunAt: { type: Date, default: null },
        lastSuccessAt: { type: Date, default: null },
        lastResult: { type: mongoose.Schema.Types.Mixed, default: null },
        lastError: { type: String, default: '' }
    },
    { collection: 'dmb_mailchimp_sync', timestamps: true }
);
export const DMBMailchimpSync = mongoose.models.DMBMailchimpSync || mongoose.model('DMBMailchimpSync', stateSchema);

const serverOf = (apiKey) => {
    const dc = String(apiKey || '').split('-')[1];
    if (!dc || !/^[a-z]+\d+$/.test(dc)) throw new Error('The Mailchimp API key must end with its data centre, e.g. "…-us21"');
    return `https://${dc}.api.mailchimp.com/3.0`;
};

const call = async (cfg, method, path, body) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    try {
        const res = await fetch(`${serverOf(cfg.apiKey)}${path}`, {
            method,
            headers: { Authorization: `Basic ${Buffer.from(`dmb:${cfg.apiKey}`).toString('base64')}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) throw new Error(`Mailchimp ${res.status}: ${json?.detail || json?.title || text.slice(0, 200)}`);
        return json;
    } finally {
        clearTimeout(t);
    }
};

export const memberHash = (email) => crypto.createHash('md5').update(String(email).trim().toLowerCase()).digest('hex');

export const testMailchimp = async () => {
    const cfg = await getIntegrationConfig('mailchimp');
    if (!cfg.apiKey || !cfg.audienceId) throw new Error('Set the Mailchimp API key and audience ID first');
    await call(cfg, 'GET', '/ping');
    const list = await call(cfg, 'GET', `/lists/${encodeURIComponent(cfg.audienceId)}?fields=id,name,stats.member_count`);
    await markIntegrationChecked('mailchimp', true);
    return { audience: list?.name, members: list?.stats?.member_count };
};

/** Tags for one customer from their subscriptions and segments. */
const tagsFor = (user, subs, segmentNames) => {
    const tags = new Set();
    const live = subs.filter((s) => ['active', 'paused'].includes(s.status));
    if (live.length) tags.add('active');
    else if (subs.some((s) => ['cancelled', 'expired'].includes(s.status))) tags.add('churned');
    if (live.some((s) => s.isTrial)) tags.add('trial');
    if (user.role === 'EMPLOYEE' || user.companyId || user.invoiceType === 'b2b_vat') tags.add('b2b');
    for (const n of segmentNames) tags.add(n);
    return [...tags];
};

const ALL_STATUS_TAGS = ['active', 'churned', 'trial', 'b2b'];

export const runMailchimpSync = async ({ force = false } = {}) => {
    if (!force && !(await isEnabled('mailchimpSync'))) return { skipped: 'disabled' };
    const cfg = await getIntegrationConfig('mailchimp');
    if (!cfg.apiKey || !cfg.audienceId) return { skipped: 'not_configured' };
    const state = (await DMBMailchimpSync.findById('mailchimp').lean()) || {};
    const since = state.lastSuccessAt || new Date(0);
    await DMBMailchimpSync.updateOne({ _id: 'mailchimp' }, { $set: { lastRunAt: new Date() } }, { upsert: true });

    const { FoodUser } = await import('../../../core/users/user.model.js');
    const { DMBSubscription } = await import('../subscription/subscription.model.js');
    let segments = new Map();
    try {
        const { DMBCustomerSegment } = await import('../customer/segment.model.js');
        segments = new Map((await DMBCustomerSegment.find({}).select('name').lean()).map((s) => [String(s._id), s.name]));
    } catch { /* segments optional */ }

    const result = { subscribed: 0, unsubscribed: 0, errors: 0 };
    const consenting = FoodUser.find({ 'marketingEmailConsent.granted': true, email: { $nin: [null, ''] }, isActive: { $ne: false } })
        .select('email name role companyId invoiceType segmentIds').lean().cursor();
    for await (const user of consenting) {
        try {
            const subs = await DMBSubscription.find({ userId: user._id }).select('status isTrial').lean();
            const [first, ...rest] = String(user.name || '').trim().split(/\s+/);
            const hash = memberHash(user.email);
            await call(cfg, 'PUT', `/lists/${encodeURIComponent(cfg.audienceId)}/members/${hash}`, {
                email_address: user.email, status_if_new: 'subscribed', status: 'subscribed',
                merge_fields: { FNAME: first || '', LNAME: rest.join(' ') }
            });
            const tags = tagsFor(user, subs, (user.segmentIds || []).map((id) => segments.get(String(id))).filter(Boolean));
            const payload = [
                ...tags.map((name) => ({ name, status: 'active' })),
                ...ALL_STATUS_TAGS.filter((t) => !tags.includes(t)).map((name) => ({ name, status: 'inactive' }))
            ];
            await call(cfg, 'POST', `/lists/${encodeURIComponent(cfg.audienceId)}/members/${hash}/tags`, { tags: payload });
            result.subscribed++;
        } catch (err) {
            result.errors++;
            logger.warn(`[mailchimp] ${user._id}: ${err.message}`);
        }
    }
    // Consent withdrawn since the last successful run → unsubscribe (GDPR).
    const withdrawn = await FoodUser.find({ 'marketingEmailConsent.granted': false, 'marketingEmailConsent.withdrawnAt': { $gte: since }, email: { $nin: [null, ''] } }).select('email').lean();
    for (const user of withdrawn) {
        try {
            await call(cfg, 'PATCH', `/lists/${encodeURIComponent(cfg.audienceId)}/members/${memberHash(user.email)}`, { status: 'unsubscribed' });
            result.unsubscribed++;
        } catch (err) {
            if (!/404/.test(err.message)) { result.errors++; logger.warn(`[mailchimp] unsubscribe ${user._id}: ${err.message}`); }
        }
    }
    await DMBMailchimpSync.updateOne({ _id: 'mailchimp' }, { $set: { lastResult: result, lastError: '', ...(result.errors === 0 ? { lastSuccessAt: new Date() } : {}) } }, { upsert: true });
    await markIntegrationChecked('mailchimp', result.errors === 0);
    return result;
};

export const mailchimpStatus = async () => DMBMailchimpSync.findById('mailchimp').lean();
export const _tagsFor = tagsFor;
