import mongoose from 'mongoose';
import { isEncrypted } from '../../../utils/fieldCrypto.js';
import { config } from '../../../config/env.js';

/**
 * AP-09 Security status (Gap N). Reports what the running deployment actually does, so the Security Architecture
 * document can be checked against production before go-live. Nothing here reveals key material.
 */

export const ENCRYPTED_FIELDS = [
    { model: 'FoodUser', collection: 'food_users', paths: ['addresses.street', 'addresses.additionalDetails', 'addresses.zipCode', 'addresses.phone', 'whatsappNumber'], label: 'Customer addresses & WhatsApp number' },
    { model: 'FoodDeliveryPartner', collection: 'food_delivery_partners', paths: ['bankAccountNumber', 'bankIban'], label: 'Driver bank details' },
    { model: 'FoodRestaurant', collection: 'food_restaurants', paths: ['accountNumber'], label: 'Vendor bank account' },
    { model: 'FleetPartner', collection: 'fleet_partners', paths: ['bankIban'], label: 'Fleet partner bank details' },
    { model: 'KitchenPartner', collection: null, paths: ['bankDetails'], label: 'Kitchen partner bank details' },
    { model: 'DMBWhatsAppLog', collection: 'dmb_whatsapp_logs', paths: ['to'], label: 'WhatsApp invoice recipients' }
];

const keyStatus = () => {
    const primary = Boolean(process.env.PII_ENCRYPTION_KEY);
    return {
        primaryKeyConfigured: primary,
        previousKeyConfigured: Boolean(process.env.PII_ENCRYPTION_KEY_PREVIOUS),
        source: primary ? 'PII_ENCRYPTION_KEY' : 'derived from JWT secret (development only)',
        algorithm: 'AES-256-GCM, random 96-bit IV per value'
    };
};

/** Counts stored values per field that are still plaintext (should be 0 once the bootstrap migration has run). */
const coverage = async () => {
    const out = [];
    for (const entry of ENCRYPTED_FIELDS) {
        let Model;
        try {
            Model = mongoose.model(entry.model);
        } catch {
            continue;
        }
        const fields = [];
        for (const path of entry.paths) {
            const filter = { [path]: { $type: 'string', $nin: [''] } };
            const sample = await Model.collection.find(filter).project({ [path]: 1 }).limit(2000).toArray();
            let encrypted = 0;
            let plaintext = 0;
            for (const doc of sample) {
                const values = path.includes('.')
                    ? (doc[path.split('.')[0]] || []).map((a) => a?.[path.split('.')[1]])
                    : [doc[path]];
                for (const v of values) {
                    if (typeof v !== 'string' || !v) continue;
                    if (isEncrypted(v)) encrypted++;
                    else plaintext++;
                }
            }
            fields.push({ path, encrypted, plaintext, sampled: sample.length });
        }
        out.push({ label: entry.label, model: entry.model, fields });
    }
    return out;
};

export const securityStatus = async () => {
    const production = config.nodeEnv === 'production';
    const forceHttps = process.env.FORCE_HTTPS ? process.env.FORCE_HTTPS === 'true' : production;
    const mongoUri = String(process.env.MONGO_URI || process.env.MONGODB_URI || '');
    const apiUrl = String(process.env.API_PUBLIC_URL || '');
    return {
        environment: config.nodeEnv,
        inTransit: {
            httpsRedirect: forceHttps,
            hsts: production,
            apiPublicUrlHttps: apiUrl ? apiUrl.startsWith('https://') : null,
            websocket: forceHttps ? 'WSS (socket.io over the HTTPS origin)' : 'WS allowed (non-production)',
            note: 'TLS 1.3 is configured on the load balancer / reverse proxy that terminates TLS.'
        },
        atRest: {
            mongoTls: /^mongodb\+srv:\/\//.test(mongoUri) || /[?&](tls|ssl)=true/.test(mongoUri),
            atlas: /mongodb\.net/.test(mongoUri),
            note: 'MongoDB Atlas Encryption at Rest (AES-256) is enabled in the Atlas project; confirm in writing before launch.'
        },
        fieldLevel: { key: keyStatus(), coverage: await coverage() },
        documents: {
            invoiceLinks: process.env.INVOICE_LINK_SECRET ? 'signed, expiring links' : 'signed with a derived secret — set INVOICE_LINK_SECRET',
            note: 'Driver identity documents are uploaded to the media store; see the Security Architecture document for access rules.'
        },
        checkedAt: new Date()
    };
};
