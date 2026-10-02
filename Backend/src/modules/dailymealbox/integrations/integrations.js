import mongoose from 'mongoose';
import { AdminIntegrationSetting } from '../../food/admin/models/integrationSetting.model.js';
import { encryptField, safeDecrypt, maskTail } from '../../../utils/fieldCrypto.js';

/**
 * Third-party integrations configured in AP-09 (Gaps H, I, J). Secrets entered by an admin are stored encrypted
 * (AES-256-GCM, Gap N) and never returned in full; environment variables, when set, take precedence so production can
 * keep secrets out of the database entirely.
 *
 *   whatsapp   provider: twilio | 360dialog
 *              twilio: accountSid, authToken*, fromNumber ("+48…"), contentSid (approved template, optional)
 *              360dialog: apiKey*, templateName (approved template with a document header, optional), templateLanguage
 *   mailchimp  apiKey* ("…-us21"), audienceId
 * (* = secret)
 */

export const INTEGRATIONS = {
    whatsapp: {
        label: 'WhatsApp Business — invoice delivery (Gap J)',
        fields: {
            provider: { type: 'enum', options: ['twilio', '360dialog'], default: 'twilio' },
            accountSid: { type: 'string', env: 'TWILIO_ACCOUNT_SID' },
            authToken: { type: 'secret', env: 'TWILIO_AUTH_TOKEN' },
            fromNumber: { type: 'string', env: 'TWILIO_WHATSAPP_FROM' },
            contentSid: { type: 'string', env: 'TWILIO_WHATSAPP_CONTENT_SID' },
            apiKey: { type: 'secret', env: 'D360_API_KEY' },
            templateName: { type: 'string', env: 'D360_TEMPLATE_NAME' },
            templateLanguage: { type: 'string', default: 'pl' }
        }
    },
    mailchimp: {
        label: 'Mailchimp — opted-in customer sync (Gap I)',
        fields: {
            apiKey: { type: 'secret', env: 'MAILCHIMP_API_KEY' },
            audienceId: { type: 'string', env: 'MAILCHIMP_AUDIENCE_ID' }
        }
    }
};

const providerKey = (id) => `dmb_${id}`;

const loadDoc = async (id) => AdminIntegrationSetting.findOne({ provider: providerKey(id), environment: 'prod', cityId: null }).lean();

/** Full config for server-side use (secrets decrypted, env vars win). */
export const getIntegrationConfig = async (id) => {
    const def = INTEGRATIONS[id];
    if (!def) throw new Error(`Unknown integration ${id}`);
    const doc = await loadDoc(id);
    const out = {};
    for (const [name, f] of Object.entries(def.fields)) {
        const fromEnv = f.env ? process.env[f.env] : undefined;
        if (fromEnv) { out[name] = fromEnv; continue; }
        const raw = f.type === 'secret' ? doc?.secretRefs?.[name] : doc?.publicConfig?.[name];
        out[name] = f.type === 'secret' ? safeDecrypt(raw || '') : (raw ?? f.default ?? '');
    }
    out.status = doc?.status || 'not_configured';
    return out;
};

/** Admin view: secrets masked, plus where each value comes from. */
export const describeIntegration = async (id) => {
    const def = INTEGRATIONS[id];
    const doc = await loadDoc(id);
    const fields = {};
    for (const [name, f] of Object.entries(def.fields)) {
        const fromEnv = f.env && process.env[f.env] ? 'env' : null;
        if (f.type === 'secret') {
            const stored = doc?.secretRefs?.[name] ? safeDecrypt(doc.secretRefs[name]) : '';
            fields[name] = { type: f.type, set: Boolean(fromEnv || stored), masked: fromEnv ? 'set in server environment' : (stored ? maskTail(stored, 4) : ''), source: fromEnv || (stored ? 'admin' : null), env: f.env || null };
        } else {
            fields[name] = { type: f.type, value: fromEnv ? process.env[f.env] : (doc?.publicConfig?.[name] ?? f.default ?? ''), options: f.options, source: fromEnv || (doc?.publicConfig?.[name] !== undefined ? 'admin' : null), env: f.env || null };
        }
    }
    return { id, label: def.label, status: doc?.status || 'not_configured', lastCheckedAt: doc?.lastCheckedAt || null, fields };
};

/** Saves admin input. Empty secret inputs keep the stored secret; `null` clears it. */
export const saveIntegration = async (id, input = {}, adminId = null) => {
    const def = INTEGRATIONS[id];
    if (!def) throw new Error(`Unknown integration ${id}`);
    const doc = await loadDoc(id);
    const publicConfig = { ...(doc?.publicConfig || {}) };
    const secretRefs = { ...(doc?.secretRefs || {}) };
    for (const [name, f] of Object.entries(def.fields)) {
        if (!(name in input)) continue;
        const v = input[name];
        if (f.type === 'secret') {
            if (v === null) delete secretRefs[name];
            else if (String(v || '').trim()) secretRefs[name] = encryptField(String(v).trim());
        } else if (f.type === 'enum') {
            if (!f.options.includes(v)) throw new Error(`${name} must be one of ${f.options.join(', ')}`);
            publicConfig[name] = v;
        } else {
            publicConfig[name] = String(v ?? '').trim().slice(0, 300);
        }
    }
    await AdminIntegrationSetting.findOneAndUpdate(
        { provider: providerKey(id), environment: 'prod', cityId: null },
        { $set: { provider: providerKey(id), label: def.label, category: 'dailymealbox', environment: 'prod', cityId: null, publicConfig, secretRefs, status: 'active', lastChangedBy: adminId && mongoose.Types.ObjectId.isValid(String(adminId)) ? adminId : null, requires2fa: false } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return describeIntegration(id);
};

export const markIntegrationChecked = async (id, ok) => {
    await AdminIntegrationSetting.updateOne({ provider: providerKey(id), environment: 'prod', cityId: null }, { $set: { lastCheckedAt: new Date(), status: ok ? 'active' : 'error' } });
};
