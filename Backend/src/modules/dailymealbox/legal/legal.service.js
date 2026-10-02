import mongoose from 'mongoose';
import { isEnabled } from '../platform/platformConfig.service.js';
import { logger } from '../../../utils/logger.js';

/**
 * Legal document management (Gap AC, ACM-168) — AP-13 "Legal Documents".
 *
 * A document type has numbered versions; each version holds one translation per language. Versions are immutable once
 * published (an edit creates the next draft version) and every save is also written to an append-only revision log,
 * so the platform can always show exactly which text a user agreed to.
 * Publishing a version with "requires re-acceptance" makes every affected user accept it on next login (blocking
 * modal). The Track 1 Cook Agreement is always required: a Track 1 cook without an acceptance of the current version
 * cannot go online or mark orders ready.
 */

export const DOC_TYPES = {
    terms_of_sale: { label: 'Terms of Sale', audiences: ['customer'] },
    privacy_policy: { label: 'Privacy Policy', audiences: ['customer', 'vendor', 'driver'] },
    terms_of_service: { label: 'Terms of Service', audiences: ['customer', 'vendor', 'driver'] },
    cook_agreement_track1: { label: 'Cook Agreement (Track 1)', audiences: ['vendor'], alwaysRequired: true, vendorFilter: { cookTrack: 1 } },
    vendor_agreement_track2: { label: 'Vendor Agreement (Track 2)', audiences: ['vendor'], vendorFilter: { cookTrack: { $ne: 1 } } },
    fleet_partner_agreement: { label: 'Fleet Partner Agreement', audiences: ['fleet'] },
    driver_agreement: { label: 'Driver Agreement', audiences: ['driver'] }
};
const FALLBACK_LANGS = ['pl', 'en'];

const translationSchema = new mongoose.Schema(
    { language: { type: String, required: true, lowercase: true, trim: true }, title: { type: String, required: true, trim: true }, body: { type: String, default: '' }, contentUrl: { type: String, default: '' } },
    { _id: false }
);
const legalDocSchema = new mongoose.Schema(
    {
        docType: { type: String, enum: Object.keys(DOC_TYPES), required: true, index: true },
        version: { type: Number, required: true, min: 1 },
        status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
        translations: { type: [translationSchema], default: [] },
        effectiveDate: { type: Date, default: null },
        requiresReacceptance: { type: Boolean, default: false },
        changeNote: { type: String, default: '', trim: true },
        publishedAt: { type: Date, default: null },
        publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    { collection: 'dmb_legal_documents', timestamps: true }
);
legalDocSchema.index({ docType: 1, version: 1 }, { unique: true });
export const DMBLegalDocument = mongoose.models.DMBLegalDocument || mongoose.model('DMBLegalDocument', legalDocSchema);

/** Append-only: one row per save of any version (legal_document_versions). Never updated or deleted. */
const revisionSchema = new mongoose.Schema(
    { documentId: { type: mongoose.Schema.Types.ObjectId, index: true }, docType: String, version: Number, status: String, snapshot: mongoose.Schema.Types.Mixed, action: String, by: { type: mongoose.Schema.Types.ObjectId, default: null } },
    { collection: 'dmb_legal_document_versions', timestamps: { createdAt: true, updatedAt: false } }
);
export const DMBLegalRevision = mongoose.models.DMBLegalRevision || mongoose.model('DMBLegalRevision', revisionSchema);

const acceptanceSchema = new mongoose.Schema(
    {
        userType: { type: String, enum: ['customer', 'vendor', 'driver', 'fleet'], required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        docType: { type: String, required: true },
        version: { type: Number, required: true },
        language: { type: String, default: '' },
        acceptedAt: { type: Date, default: () => new Date() },
        ip: { type: String, default: '' },
        userAgent: { type: String, default: '' }
    },
    { collection: 'dmb_user_legal_acceptances' }
);
acceptanceSchema.index({ userType: 1, userId: 1, docType: 1, version: 1 }, { unique: true });
acceptanceSchema.index({ docType: 1, version: 1 });
export const DMBLegalAcceptance = mongoose.models.DMBLegalAcceptance || mongoose.model('DMBLegalAcceptance', acceptanceSchema);

export class LegalError extends Error {
    constructor(message, statusCode = 400, code = 'LEGAL_INVALID') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

const writeRevision = async (doc, action, by) => {
    await DMBLegalRevision.create({ documentId: doc._id, docType: doc.docType, version: doc.version, status: doc.status, snapshot: doc.toObject ? doc.toObject() : doc, action, by: by || null });
};

const cleanTranslations = (list) => {
    const out = [];
    for (const t of Array.isArray(list) ? list : []) {
        const language = String(t.language || '').toLowerCase().trim().slice(0, 8);
        const title = String(t.title || '').trim().slice(0, 200);
        if (!language || !title) continue;
        out.push({ language, title, body: String(t.body || '').slice(0, 200_000), contentUrl: String(t.contentUrl || '').slice(0, 500) });
    }
    if (!out.length) throw new LegalError('Add at least one language with a title');
    return out;
};

export const currentPublished = async (docType) => DMBLegalDocument.findOne({ docType, status: 'published' }).sort({ version: -1 }).lean();

/** AP-13 table: every document type with its current version, draft, languages and acceptance counts. */
export const listDocuments = async () => {
    const rows = [];
    for (const [docType, def] of Object.entries(DOC_TYPES)) {
        const [current, draft, versions] = await Promise.all([
            currentPublished(docType),
            DMBLegalDocument.findOne({ docType, status: 'draft' }).sort({ version: -1 }).lean(),
            DMBLegalDocument.countDocuments({ docType })
        ]);
        const stats = current ? await acceptanceStats(docType, current) : null;
        rows.push({ docType, label: def.label, audiences: def.audiences, alwaysRequired: Boolean(def.alwaysRequired), current, draft, versions, stats });
    }
    return { documents: rows, enforcement: await isEnabled('legalReacceptance') };
};

export const history = async (docType) => {
    if (!DOC_TYPES[docType]) throw new LegalError('Unknown document type');
    const [versions, revisions] = await Promise.all([
        DMBLegalDocument.find({ docType }).sort({ version: -1 }).lean(),
        DMBLegalRevision.find({ docType }).sort({ createdAt: -1 }).limit(200).lean()
    ]);
    return { versions, revisions: revisions.map((r) => ({ _id: r._id, version: r.version, action: r.action, status: r.status, at: r.createdAt, by: r.by })) };
};

/** Saves a draft. Editing a published version creates the next draft version (published ones never change). */
export const saveDraft = async ({ docType, translations, effectiveDate, requiresReacceptance, changeNote }, adminId) => {
    if (!DOC_TYPES[docType]) throw new LegalError('Unknown document type');
    const clean = cleanTranslations(translations);
    let doc = await DMBLegalDocument.findOne({ docType, status: 'draft' }).sort({ version: -1 });
    if (!doc) {
        const last = await DMBLegalDocument.findOne({ docType }).sort({ version: -1 }).lean();
        doc = new DMBLegalDocument({ docType, version: (last?.version || 0) + 1, createdBy: adminId });
    }
    doc.translations = clean;
    doc.effectiveDate = effectiveDate ? new Date(effectiveDate) : doc.effectiveDate;
    doc.requiresReacceptance = Boolean(requiresReacceptance);
    doc.changeNote = String(changeNote || '').slice(0, 500);
    await doc.save();
    await writeRevision(doc, 'save_draft', adminId);
    return doc.toObject();
};

export const publish = async (id, adminId) => {
    const doc = await DMBLegalDocument.findById(id);
    if (!doc) throw new LegalError('Document not found', 404);
    if (doc.status !== 'draft') throw new LegalError('Only a draft can be published');
    await DMBLegalDocument.updateMany({ docType: doc.docType, status: 'published' }, { $set: { status: 'archived' } });
    doc.status = 'published';
    doc.publishedAt = new Date();
    doc.publishedBy = adminId || null;
    if (!doc.effectiveDate) doc.effectiveDate = doc.publishedAt;
    await doc.save();
    await writeRevision(doc, 'publish', adminId);
    logger.info(`[legal] ${doc.docType} v${doc.version} published${doc.requiresReacceptance ? ' (re-acceptance required)' : ''}`);
    return doc.toObject();
};

export const discardDraft = async (id, adminId) => {
    const doc = await DMBLegalDocument.findById(id);
    if (!doc || doc.status !== 'draft') throw new LegalError('Only a draft can be discarded');
    await writeRevision(doc, 'discard_draft', adminId);
    await doc.deleteOne();
    return { discarded: true };
};

/** The text a user should see: their language, else Polish, else English, else the first translation. */
export const pickTranslation = (doc, language) => {
    const list = doc?.translations || [];
    for (const lang of [String(language || '').toLowerCase(), ...FALLBACK_LANGS]) {
        const t = list.find((x) => x.language === lang);
        if (t) return t;
    }
    return list[0] || null;
};

export const publicDocument = async (docType, language) => {
    if (!DOC_TYPES[docType]) throw new LegalError('Unknown document type', 404);
    const doc = await currentPublished(docType);
    if (!doc) return null;
    const t = pickTranslation(doc, language);
    return { docType, version: doc.version, effectiveDate: doc.effectiveDate, language: t?.language, title: t?.title, body: t?.body, contentUrl: t?.contentUrl };
};

const roleOf = (role) => ({ USER: 'customer', EMPLOYEE: 'customer', RESTAURANT: 'vendor', DELIVERY_PARTNER: 'driver' }[String(role || '').toUpperCase()] || null);

/** Documents the user must accept now (blocking modal). */
export const pendingForUser = async ({ role, userId, language }) => {
    const userType = roleOf(role);
    if (!userType) return [];
    const enforce = await isEnabled('legalReacceptance');
    let vendor = null;
    if (userType === 'vendor') {
        const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
        vendor = await FoodRestaurant.findById(userId).select('cookTrack vendorType').lean();
    }
    const out = [];
    for (const [docType, def] of Object.entries(DOC_TYPES)) {
        if (!def.audiences.includes(userType)) continue;
        if (def.vendorFilter && userType === 'vendor') {
            if (def.vendorFilter.cookTrack === 1 && vendor?.cookTrack !== 1) continue;
            if (def.vendorFilter.cookTrack?.$ne === 1 && vendor?.cookTrack === 1) continue;
        }
        const doc = await currentPublished(docType);
        if (!doc) continue;
        const required = def.alwaysRequired || (enforce && doc.requiresReacceptance);
        if (!required) continue;
        const accepted = await DMBLegalAcceptance.exists({ userType, userId, docType, version: doc.version });
        if (accepted) continue;
        const t = pickTranslation(doc, language);
        out.push({ docType, label: def.label, version: doc.version, effectiveDate: doc.effectiveDate, title: t?.title, body: t?.body, contentUrl: t?.contentUrl, language: t?.language });
    }
    return out;
};

export const accept = async ({ role, userId, docType, version, language, ip, userAgent }) => {
    const userType = roleOf(role);
    if (!userType) throw new LegalError('This account type does not accept documents here');
    const doc = await currentPublished(docType);
    if (!doc || doc.version !== Number(version)) throw new LegalError('This version is no longer current — reload and review the latest one', 409, 'VERSION_CHANGED');
    await DMBLegalAcceptance.updateOne(
        { userType, userId, docType, version: doc.version },
        { $setOnInsert: { userType, userId, docType, version: doc.version, language: language || '', acceptedAt: new Date(), ip: String(ip || '').slice(0, 64), userAgent: String(userAgent || '').slice(0, 300) } },
        { upsert: true }
    );
    return { accepted: true, docType, version: doc.version };
};

/** Live counts for the acceptance dashboard. */
export const acceptanceStats = async (docType, current) => {
    const def = DOC_TYPES[docType];
    const accepted = await DMBLegalAcceptance.countDocuments({ docType, version: current.version });
    let audience = 0;
    for (const a of def.audiences) {
        if (a === 'customer') {
            const { FoodUser } = await import('../../../core/users/user.model.js');
            audience += await FoodUser.countDocuments({ isActive: { $ne: false } });
        } else if (a === 'vendor') {
            const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
            audience += await FoodRestaurant.countDocuments({ status: 'approved', ...(def.vendorFilter || {}) });
        } else if (a === 'driver') {
            const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
            audience += await FoodDeliveryPartner.countDocuments({ status: 'approved' });
        }
    }
    return { accepted, audience, pending: Math.max(0, audience - accepted) };
};

/** Gate for Track 1 cooks: going online / marking orders ready needs the current Cook Agreement. */
export const assertCookAgreementAccepted = async (vendorId) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const vendor = await FoodRestaurant.findById(vendorId).select('cookTrack track1Paused').lean();
    if (vendor?.cookTrack !== 1) return;
    if (vendor.track1Paused) throw new LegalError('Your account is paused until your Sanepid registration document is uploaded', 403, 'TRACK1_PAUSED');
    const doc = await currentPublished('cook_agreement_track1');
    if (!doc) return;
    const ok = await DMBLegalAcceptance.exists({ userType: 'vendor', userId: vendorId, docType: 'cook_agreement_track1', version: doc.version });
    if (!ok) throw new LegalError('Accept the current Cook Agreement before going online', 403, 'LEGAL_ACCEPTANCE_REQUIRED');
};

/** Track 1 cooks that may not trade right now (paused for Sanepid, or the current Cook Agreement not accepted) — they
 *  are hidden from customers until they fix it. `vendors` need `_id`, `cookTrack` and `track1Paused`. */
export const blockedCookIds = async (vendors = []) => {
    const track1 = vendors.filter((v) => v?.cookTrack === 1);
    const blocked = new Set(track1.filter((v) => v.track1Paused).map((v) => String(v._id)));
    const rest = track1.filter((v) => !v.track1Paused);
    if (!rest.length) return blocked;
    const doc = await currentPublished('cook_agreement_track1');
    if (!doc) return blocked;
    const accepted = new Set((await DMBLegalAcceptance.find({ userType: 'vendor', userId: { $in: rest.map((v) => v._id) }, docType: 'cook_agreement_track1', version: doc.version }).distinct('userId')).map(String));
    for (const v of rest) if (!accepted.has(String(v._id))) blocked.add(String(v._id));
    return blocked;
};
