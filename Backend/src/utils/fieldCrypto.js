import crypto from 'crypto';
import { logger } from './logger.js';

/**
 * Application-level field encryption (GDPR Art. 32 — Amendment v2 Gap N).
 *
 * AES-256-GCM with a random 96-bit IV per value. Stored form:  enc:v1:<keyId>:<iv b64>:<tag b64>:<ciphertext b64>
 * The key id is a fingerprint of the key ("k" + 8 hex chars), so a value always names the key that wrote it.
 *
 *   PII_ENCRYPTION_KEY   32-byte key, base64 or hex. REQUIRED in production.
 *   PII_ENCRYPTION_KEY_PREVIOUS  the key before a rotation. Values it wrote still decrypt, and the start-up migration
 *                        (platform bootstrap → encryptExistingValues) re-encrypts them with the current key; remove it
 *                        once that has run.
 *
 * Without PII_ENCRYPTION_KEY (local development) a key is derived from JWT_ACCESS_SECRET and a warning is logged
 * once — data written that way stays readable as long as that secret does not change.
 *
 * Values written before key fingerprints were introduced carry the ids "p" (primary), "o" (previous) or "d"
 * (derived); they are still read, trying every configured key (GCM's tag rejects a wrong key).
 *
 * blindIndex() is a keyed HMAC used to look a value up (e.g. "is this phone number already registered") without
 * storing it in plaintext.
 */

const PREFIX = 'enc:v1:';
let warned = false;

const parseKey = (raw) => {
    if (!raw) return null;
    const s = String(raw).trim();
    const buf = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, 'hex') : Buffer.from(s, 'base64');
    if (buf.length !== 32) throw new Error('PII encryption keys must be 32 bytes (base64 or 64 hex chars)');
    return buf;
};

const keyId = (key) => `k${crypto.createHash('sha256').update(key).digest('hex').slice(0, 8)}`;

/** All configured keys: { primary, previous, derived } (each may be null). */
const keys = () => {
    const jwt = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    return {
        primary: parseKey(process.env.PII_ENCRYPTION_KEY),
        previous: parseKey(process.env.PII_ENCRYPTION_KEY_PREVIOUS),
        derived: jwt ? crypto.createHash('sha256').update(`pii-derived:${jwt}`).digest() : null
    };
};

/** id → key, including the legacy single-letter ids. */
const keyring = () => {
    const { primary, previous, derived } = keys();
    const ring = {};
    for (const k of [primary, previous, derived]) if (k) ring[keyId(k)] = k;
    if (primary) ring.p = primary;
    if (previous) ring.o = previous;
    if (derived) ring.d = derived;
    return ring;
};

const activeKey = () => {
    const { primary, derived } = keys();
    if (primary) return { id: keyId(primary), key: primary };
    if (!derived) throw new Error('No encryption key available: set PII_ENCRYPTION_KEY');
    if (!warned) {
        warned = true;
        const level = process.env.NODE_ENV === 'production' ? 'error' : 'warn';
        logger[level]('[crypto] PII_ENCRYPTION_KEY is not set — using a key derived from JWT_ACCESS_SECRET. Set PII_ENCRYPTION_KEY in production.');
    }
    return { id: keyId(derived), key: derived };
};

/** Id of the key new values are written with. */
export const activeKeyId = () => activeKey().id;

export const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);

export const encryptField = (plain) => {
    if (plain === null || plain === undefined || plain === '') return plain;
    if (isEncrypted(plain)) return plain;
    const { id, key } = activeKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${id}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
};

/** Decrypts a stored value. Plain (legacy, never-encrypted) values are returned unchanged. */
export const decryptField = (stored) => {
    if (!isEncrypted(stored)) return stored;
    const [, , id, ivB64, tagB64, ctB64] = stored.split(':');
    const ring = keyring();
    // The named key first, then any other configured key: legacy ids ("p" written by a key that has since been
    // rotated into PII_ENCRYPTION_KEY_PREVIOUS) don't identify the key. A wrong key fails GCM authentication.
    const candidates = [...new Set([ring[id], ...Object.values(ring)].filter(Boolean))];
    if (!candidates.length) throw new Error('No encryption key available: set PII_ENCRYPTION_KEY');
    for (const key of candidates) {
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
            decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
            return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
        } catch {
            /* try the next key */
        }
    }
    throw new Error(`None of the configured keys decrypts this value (key id "${id}")`);
};

/** True for a value encrypted with a key other than the current one (to be re-encrypted after a rotation). */
export const needsReencryption = (stored) => isEncrypted(stored) && stored.split(':')[2] !== activeKeyId();

/** Like decryptField but never throws: an unreadable value (wrong/rotated-out key) is returned as ''. */
export const safeDecrypt = (stored) => {
    try {
        return decryptField(stored);
    } catch (err) {
        logger.warn(`[crypto] Could not decrypt a stored value: ${err.message}`);
        return '';
    }
};

/** Deterministic keyed hash for equality lookups on encrypted fields. */
export const blindIndex = (value, purpose = 'default') => {
    if (value === null || value === undefined || value === '') return '';
    const { key } = activeKey();
    return crypto.createHmac('sha256', key).update(`${purpose}:${String(value).trim().toLowerCase()}`).digest('hex');
};

/** "+48 600 123 456" → "•••• 456" (last 3–4 characters kept). */
export const maskTail = (value, keep = 3) => {
    const s = String(value || '');
    if (!s) return '';
    return `•••• ${s.slice(-keep)}`;
};
