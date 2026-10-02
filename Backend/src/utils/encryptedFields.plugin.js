import mongoose from 'mongoose';
import { encryptField, safeDecrypt, isEncrypted } from './fieldCrypto.js';

/**
 * Mongoose plugin: application-level AES-256-GCM encryption of individual string fields (GDPR Art. 32, Gap N).
 *
 *   schema.plugin(encryptedFields, { paths: ['bankIban', 'addresses.street'] })
 *
 * - Writes: a setter encrypts the value (assignment, create, and $set in update queries).
 * - Reads:  a getter decrypts on hydrated documents (also in toJSON/toObject), and a post-query hook decrypts lean
 *           results — so `.lean()`, `populate()` and `findOneAndUpdate()` all hand back plaintext.
 * - Values written before encryption was switched on stay readable (plaintext passes through) and are encrypted the
 *   next time they are saved, or by the one-off migration (encryptExistingValues).
 * Encrypted fields cannot be searched with regex or equality — use them only for data nobody searches by.
 */

const decryptPath = (obj, parts) => {
    if (!obj || typeof obj !== 'object') return;
    const [head, ...rest] = parts;
    const value = obj[head];
    if (rest.length === 0) {
        if (typeof value === 'string' && isEncrypted(value)) obj[head] = safeDecrypt(value);
        return;
    }
    if (Array.isArray(value)) value.forEach((item) => decryptPath(item, rest));
    else decryptPath(value, rest);
};

export const decryptPlain = (obj, paths) => {
    if (!obj || typeof obj !== 'object' || obj instanceof mongoose.Document) return obj;
    for (const p of paths) decryptPath(obj, p.split('.'));
    return obj;
};

const getter = (v) => (typeof v === 'string' ? safeDecrypt(v) : v);
const setter = (v) => (typeof v === 'string' && v !== '' ? encryptField(v) : v);

export const encryptedFields = (schema, { paths = [], nested = [] } = {}) => {
    // `nested` = paths inside subdocument arrays whose own schema is set up with encryptedSubFields — only lean
    // results need decrypting here.
    for (const p of paths) {
        const schemaPath = schema.path(p);
        if (!schemaPath) throw new Error(`encryptedFields: unknown path "${p}"`);
        schemaPath.get(getter);
        schemaPath.set(setter);
    }
    // Path getters only (no virtuals) so API output keeps its shape.
    const opts = (existing) => ({ ...(existing || {}), getters: true, virtuals: existing?.virtuals ?? false });
    schema.set('toJSON', opts(schema.get('toJSON')));
    schema.set('toObject', opts(schema.get('toObject')));

    const all = [...paths, ...nested];
    const decryptResult = function decryptResult(res) {
        if (!res) return;
        if (Array.isArray(res)) res.forEach((doc) => decryptPlain(doc, all));
        else decryptPlain(res, all);
    };
    schema.post(['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace'], decryptResult);
    // Aggregations on the model itself return plain objects too ($lookup from other models is not covered — keep
    // encrypted fields out of cross-collection pipelines).
    schema.post('aggregate', decryptResult);
};

/** Subdocument schemas (e.g. addresses) get the same treatment for their own paths. */
export const encryptedSubFields = (subSchema, { paths = [] } = {}) => {
    for (const p of paths) {
        const schemaPath = subSchema.path(p);
        if (!schemaPath) throw new Error(`encryptedSubFields: unknown path "${p}"`);
        schemaPath.get(getter);
        schemaPath.set(setter);
    }
    subSchema.set('toJSON', { ...(subSchema.get('toJSON') || {}), getters: true, virtuals: false });
    subSchema.set('toObject', { ...(subSchema.get('toObject') || {}), getters: true, virtuals: false });
};

/** One-off migration: encrypts plaintext values already stored (raw collection writes, idempotent). */
export const encryptExistingValues = async (Model, paths, { batch = 500 } = {}) => {
    const coll = Model.collection;
    let updated = 0;
    const topLevel = paths.filter((p) => !p.includes('.'));
    const nested = paths.filter((p) => p.includes('.'));
    const or = [
        ...topLevel.map((p) => ({ [p]: { $type: 'string', $nin: ['', null], $not: /^enc:v1:/ } })),
        ...nested.map((p) => {
            const [arr, field] = p.split('.');
            return { [arr]: { $elemMatch: { [field]: { $type: 'string', $ne: '', $not: /^enc:v1:/ } } } };
        })
    ];
    if (!or.length) return { updated };
    const cursor = coll.find({ $or: or }).batchSize(batch);
    for await (const doc of cursor) {
        const set = {};
        const unchanged = { _id: doc._id };
        for (const p of topLevel) {
            const v = doc[p];
            if (typeof v === 'string' && v && !isEncrypted(v)) {
                set[p] = encryptField(v);
                unchanged[p] = v;
            }
        }
        for (const p of nested) {
            const [arr, field] = p.split('.');
            if (!Array.isArray(doc[arr])) continue;
            doc[arr].forEach((item, i) => {
                const v = item?.[field];
                if (typeof v === 'string' && v && !isEncrypted(v)) {
                    set[`${arr}.${i}.${field}`] = encryptField(v);
                    unchanged[`${arr}.${i}.${field}`] = v;
                }
            });
        }
        if (Object.keys(set).length) {
            // Only if nobody changed the values meanwhile (several instances may run this at start-up).
            const res = await coll.updateOne(unchanged, { $set: set });
            updated += res.modifiedCount;
        }
    }
    return { updated };
};
