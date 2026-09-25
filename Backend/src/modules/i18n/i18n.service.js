import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Language } from './language.model.js';
import { Translation, TranslationKey, I18nMeta } from './translation.model.js';

const SEED_DIR = process.env.I18N_SEED_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed');

/** English is both the default and the fallback language: it is the text written in the code. */
export const FALLBACK_LANGUAGE = 'en';

export const NAMESPACES = ['common', 'customer', 'vendor', 'driver', 'office', 'notifications'];
export const FRONTEND_NAMESPACES = NAMESPACES.filter((n) => n !== 'notifications');

const SEED_LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', isSystem: true, isDefault: true, sortOrder: 1 },
    { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱', sortOrder: 2 },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', sortOrder: 3 },
    { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦', sortOrder: 4 },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', sortOrder: 5 }
];

const CODE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;
const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;
const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

export const httpError = (message, statusCode = 400, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });

// ─── Placeholder / plural helpers ─────────────────────────────────────────────

/** Numbered <Trans> tags in a string, e.g. ["<0>", "</0>"]. Translators may move them but must keep them all. */
export const tagsOf = (text) => [...String(text).matchAll(/<\/?\d+\s*\/?>/g)].map((m) => m[0].replace(/\s+/g, '')).sort();

export const placeholdersOf = (text) => [...new Set([...String(text).matchAll(PLACEHOLDER_RE)].map((m) => m[1]))].sort();

/** A source string using {{count}} is pluralised: each language stores one row per plural category. */
export const isPluralKey = (key) => placeholdersOf(key).includes('count');

export const pluralCategoriesFor = (code) => {
    try {
        return new Intl.PluralRules(code).resolvedOptions().pluralCategories;
    } catch {
        return ['one', 'other'];
    }
};

/** Row keys a language is expected to translate for one source key. */
export const rowKeysFor = (code, key) => (isPluralKey(key) ? pluralCategoriesFor(code).map((c) => `${key}_${c}`) : [key]);

/** Maps a stored row key back to its source key (strips a plural suffix when the base key is pluralised). */
const splitRowKey = (rowKey, catalogSet) => {
    if (catalogSet.has(rowKey)) return { key: rowKey, category: null };
    for (const cat of PLURAL_CATEGORIES) {
        const suffix = `_${cat}`;
        if (rowKey.endsWith(suffix)) {
            const base = rowKey.slice(0, -suffix.length);
            if (catalogSet.has(base) && isPluralKey(base)) return { key: base, category: cat };
        }
    }
    return null;
};

export const interpolate = (text, vars = {}) =>
    String(text).replace(PLACEHOLDER_RE, (whole, name) => (vars[name] === undefined || vars[name] === null ? whole : String(vars[name])));

// ─── Seeding ──────────────────────────────────────────────────────────────────

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

const readSeed = async () => {
    const hash = crypto.createHash('sha1');
    const catalogText = await fs.readFile(path.join(SEED_DIR, 'catalog.json'), 'utf8');
    hash.update(catalogText);
    const catalog = JSON.parse(catalogText);

    const translations = {};
    const langDirs = await fs.readdir(path.join(SEED_DIR, 'translations')).catch(() => []);
    for (const lang of langDirs.sort()) {
        const files = (await fs.readdir(path.join(SEED_DIR, 'translations', lang))).filter((f) => f.endsWith('.json')).sort();
        for (const file of files) {
            const text = await fs.readFile(path.join(SEED_DIR, 'translations', lang, file), 'utf8');
            hash.update(`${lang}/${file}:${text}`);
            (translations[lang] ||= {})[file.replace(/\.json$/, '')] = JSON.parse(text);
        }
    }
    return { catalog, translations, hash: hash.digest('hex') };
};

let catalogCache = null;
const bundleCache = new Map();
const versionCache = new Map();

const clearCaches = () => {
    catalogCache = null;
    bundleCache.clear();
    versionCache.clear();
};

const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

const syncSeed = async () => {
    const meta = (await I18nMeta.findById('seed').lean()) || {};
    const { catalog, translations, hash } = await readSeed();
    if (meta.seedHash === hash && meta.languagesSeeded) return;

    // Languages are seeded once; afterwards the admin owns the list. Only English is always guaranteed.
    if (!meta.languagesSeeded) {
        await Language.bulkWrite(SEED_LANGUAGES.map((l) => ({ updateOne: { filter: { code: l.code }, update: { $setOnInsert: l }, upsert: true } })));
    } else if (!(await Language.exists({ code: FALLBACK_LANGUAGE }))) {
        await Language.create(SEED_LANGUAGES[0]);
    }
    if (!(await Language.exists({ isDefault: true }))) {
        await Language.updateOne({ code: FALLBACK_LANGUAGE }, { $set: { isDefault: true } });
    }

    // Keys are owned by the code: make the catalog exactly match the seed.
    const validRowKeys = {};
    for (const ns of NAMESPACES) {
        const keys = [...new Set(catalog[ns] || [])];
        validRowKeys[ns] = new Set(keys.flatMap((k) => (isPluralKey(k) ? [k, ...PLURAL_CATEGORIES.map((c) => `${k}_${c}`)] : [k])));
        for (const part of chunk(keys, 1000)) {
            await TranslationKey.bulkWrite(part.map((key) => ({ updateOne: { filter: { namespace: ns, key }, update: { $setOnInsert: { namespace: ns, key } }, upsert: true } })));
        }
        await TranslationKey.deleteMany({ namespace: ns, key: { $nin: keys } });

        const stale = (await Translation.find({ namespace: ns }).select('key').lean()).filter((r) => !validRowKeys[ns].has(r.key)).map((r) => r._id);
        if (stale.length) await Translation.deleteMany({ _id: { $in: stale } });
    }
    await TranslationKey.deleteMany({ namespace: { $nin: NAMESPACES } });

    // Seed translations never overwrite what an admin already typed.
    const existingLanguages = new Set((await Language.find().select('code').lean()).map((l) => l.code));
    for (const [lang, byNs] of Object.entries(translations)) {
        if (!existingLanguages.has(lang)) continue;
        let inserted = 0;
        for (const [ns, map] of Object.entries(byNs)) {
            if (!NAMESPACES.includes(ns)) continue;
            const ops = Object.entries(map)
                .filter(([key, value]) => typeof value === 'string' && value.trim() && validRowKeys[ns]?.has(key))
                .map(([key, value]) => ({ updateOne: { filter: { language: lang, namespace: ns, key }, update: { $setOnInsert: { language: lang, namespace: ns, key, value } }, upsert: true } }));
            for (const part of chunk(ops, 1000)) {
                const res = await Translation.bulkWrite(part, { ordered: false });
                inserted += res.upsertedCount || 0;
            }
        }
        if (inserted > 0) await Language.updateOne({ code: lang }, { $inc: { version: 1 } });
    }

    await I18nMeta.updateOne({ _id: 'seed' }, { $set: { seedHash: hash, languagesSeeded: true } }, { upsert: true });
    clearCaches();
};

/** Re-reads the seed files and applies anything new. Used by tests and after a deploy that changes seed data. */
export const resyncSeed = async () => {
    seedPromise = null;
    return ensureSeeded();
};

let seedPromise = null;
export const ensureSeeded = () => {
    if (!seedPromise) {
        seedPromise = syncSeed().catch((err) => {
            seedPromise = null;
            throw err;
        });
    }
    return seedPromise;
};

// ─── Catalog ──────────────────────────────────────────────────────────────────

const loadCatalog = async () => {
    await ensureSeeded();
    if (!catalogCache) {
        const rows = await TranslationKey.find().select('namespace key -_id').lean();
        const byNs = Object.fromEntries(NAMESPACES.map((n) => [n, []]));
        for (const r of rows) byNs[r.namespace]?.push(r.key);
        for (const n of NAMESPACES) byNs[n].sort((a, b) => a.localeCompare(b));
        catalogCache = byNs;
    }
    return catalogCache;
};

const assertNamespace = (ns) => {
    if (!NAMESPACES.includes(ns)) throw httpError(`Unknown namespace "${ns}". Use one of: ${NAMESPACES.join(', ')}`);
    return ns;
};

// ─── Languages ────────────────────────────────────────────────────────────────

export const publicLanguageShape = (l) => ({
    code: l.code, name: l.name, nativeName: l.nativeName, flag: l.flag, direction: l.direction, isDefault: l.isDefault, version: l.version
});

export const listLanguages = async ({ enabledOnly = false } = {}) => {
    await ensureSeeded();
    return Language.find(enabledOnly ? { isEnabled: true } : {}).sort({ sortOrder: 1, code: 1 }).lean();
};

export const getPublicLanguages = async () => {
    const languages = await listLanguages({ enabledOnly: true });
    return {
        languages: languages.map(publicLanguageShape),
        defaultLanguage: (languages.find((l) => l.isDefault) || languages[0])?.code || FALLBACK_LANGUAGE,
        fallbackLanguage: FALLBACK_LANGUAGE,
        namespaces: FRONTEND_NAMESPACES
    };
};

const countPreferenceUsers = async (code) => {
    const [{ FoodUser }, { FoodRestaurant }, { FoodDeliveryPartner }, { OfficeAccount }] = await Promise.all([
        import('../../core/users/user.model.js'),
        import('../food/restaurant/models/restaurant.model.js'),
        import('../food/delivery/models/deliveryPartner.model.js'),
        import('../dailymealbox/office/models/officeAccount.model.js')
    ]);
    const counts = await Promise.all([FoodUser, FoodRestaurant, FoodDeliveryPartner, OfficeAccount].map((M) => M.countDocuments({ languagePreference: code })));
    return { customers: counts[0], vendors: counts[1], drivers: counts[2], offices: counts[3], total: counts.reduce((a, b) => a + b, 0) };
};

/** Completion per language: translated rows / expected rows across all namespaces. */
export const getLanguageStats = async () => {
    const [languages, catalog] = await Promise.all([listLanguages(), loadCatalog()]);
    const grouped = await Translation.aggregate([{ $group: { _id: { language: '$language', namespace: '$namespace' }, keys: { $push: '$key' } } }]);
    const translatedBy = new Map(grouped.map((g) => [`${g._id.language}:${g._id.namespace}`, new Set(g.keys)]));

    const result = [];
    for (const lang of languages) {
        const perNamespace = {};
        let total = 0;
        let translated = 0;
        for (const ns of NAMESPACES) {
            const have = translatedBy.get(`${lang.code}:${ns}`) || new Set();
            let nsTotal = 0;
            let nsDone = 0;
            for (const key of catalog[ns]) {
                for (const row of rowKeysFor(lang.code, key)) {
                    nsTotal++;
                    // English is the source text, so a non-plural key is always "translated" for it.
                    if (have.has(row) || (lang.code === FALLBACK_LANGUAGE && !isPluralKey(key))) nsDone++;
                }
            }
            perNamespace[ns] = { total: nsTotal, translated: nsDone };
            total += nsTotal;
            translated += nsDone;
        }
        result.push({ code: lang.code, total, translated, percent: total ? Math.round((translated / total) * 100) : 100, namespaces: perNamespace });
    }
    return result;
};

const cleanLanguageInput = (body, { partial = false } = {}) => {
    const out = {};
    if (!partial || body.name !== undefined) {
        const name = String(body.name || '').trim();
        if (!name) throw httpError('Language name is required');
        out.name = name.slice(0, 60);
    }
    if (!partial || body.nativeName !== undefined) {
        const nativeName = String(body.nativeName || '').trim();
        if (!nativeName) throw httpError('Native name is required (e.g. "Čeština")');
        out.nativeName = nativeName.slice(0, 60);
    }
    if (body.flag !== undefined) out.flag = String(body.flag).trim().slice(0, 8);
    if (body.direction !== undefined) {
        if (!['ltr', 'rtl'].includes(body.direction)) throw httpError('direction must be "ltr" or "rtl"');
        out.direction = body.direction;
    }
    if (body.sortOrder !== undefined) {
        const n = Number(body.sortOrder);
        if (!Number.isFinite(n)) throw httpError('sortOrder must be a number');
        out.sortOrder = n;
    }
    if (body.isEnabled !== undefined) out.isEnabled = Boolean(body.isEnabled);
    return out;
};

export const createLanguage = async (body) => {
    await ensureSeeded();
    const data = cleanLanguageInput(body);
    const code = String(body.code || '').trim().toLowerCase();
    if (!CODE_RE.test(code)) throw httpError('Language code must look like "cs" or "pt-br" (2-3 letters, optional region)');
    if (await Language.exists({ code })) throw httpError(`Language "${code}" already exists`, 409);
    if (data.sortOrder === undefined) data.sortOrder = (await Language.countDocuments()) + 1;
    const doc = await Language.create({ ...data, code, isSystem: false, isDefault: false });
    clearCaches();
    return doc.toObject();
};

export const updateLanguage = async (id, body) => {
    await ensureSeeded();
    const doc = await Language.findById(id);
    if (!doc) throw httpError('Language not found', 404);
    const data = cleanLanguageInput(body, { partial: true });

    if (data.isEnabled === false) {
        if (doc.isSystem) throw httpError('English is the fallback language and cannot be disabled', 409);
        if (doc.isDefault) throw httpError('Make another language the default before disabling this one', 409);
    }
    if (body.isDefault === true) {
        const willBeEnabled = data.isEnabled ?? doc.isEnabled;
        if (!willBeEnabled) throw httpError('A disabled language cannot be the default', 409);
        await Language.updateMany({ _id: { $ne: doc._id } }, { $set: { isDefault: false } });
        doc.isDefault = true;
    } else if (body.isDefault === false && doc.isDefault) {
        throw httpError('Choose another language as the default instead', 409);
    }

    Object.assign(doc, data);
    await doc.save();
    clearCaches();
    return doc.toObject();
};

export const deleteLanguage = async (id) => {
    await ensureSeeded();
    const doc = await Language.findById(id);
    if (!doc) throw httpError('Language not found', 404);
    if (doc.isSystem) throw httpError('English is the fallback language and cannot be deleted', 409);
    if (doc.isDefault) throw httpError('Make another language the default before deleting this one', 409);

    const usage = await countPreferenceUsers(doc.code);
    if (usage.total > 0) {
        throw httpError(
            `${usage.total} account(s) use this language (${usage.customers} customers, ${usage.vendors} vendors, ${usage.drivers} drivers, ${usage.offices} office accounts). Disable it instead of deleting.`,
            409,
            { usage }
        );
    }
    await Translation.deleteMany({ language: doc.code });
    await doc.deleteOne();
    clearCaches();
    return { deleted: true };
};

// ─── Bundles (what the apps download) ─────────────────────────────────────────

const currentVersion = async (code) => {
    const hit = versionCache.get(code);
    if (hit && Date.now() - hit.at < 10_000) return hit.version;
    const doc = await Language.findOne({ code }).select('version').lean();
    const version = doc?.version ?? 0;
    versionCache.set(code, { version, at: Date.now() });
    return version;
};

const loadBundle = async (code) => {
    const version = await currentVersion(code);
    const cached = bundleCache.get(code);
    if (cached && cached.version === version) return cached;

    const namespaces = Object.fromEntries(NAMESPACES.map((n) => [n, {}]));
    const cursor = Translation.find({ language: code }).select('namespace key value -_id').lean().cursor();
    for await (const row of cursor) {
        if (namespaces[row.namespace]) namespaces[row.namespace][row.key] = row.value;
    }
    const entry = { version, namespaces };
    bundleCache.set(code, entry);
    return entry;
};

export const getBundle = async (code, { namespaces = FRONTEND_NAMESPACES, includeDisabled = false } = {}) => {
    await ensureSeeded();
    const lang = await Language.findOne({ code: String(code || '').toLowerCase() }).lean();
    if (!lang || (!lang.isEnabled && !includeDisabled)) throw httpError(`Language "${code}" is not available`, 404);
    const bundle = await loadBundle(lang.code);
    return {
        language: lang.code,
        version: bundle.version,
        namespaces: Object.fromEntries(namespaces.filter((n) => NAMESPACES.includes(n)).map((n) => [n, bundle.namespaces[n]]))
    };
};

// ─── Admin: catalog editing ───────────────────────────────────────────────────

const requireLanguage = async (code) => {
    const lang = await Language.findOne({ code: String(code || '').toLowerCase() }).lean();
    if (!lang) throw httpError(`Language "${code}" not found`, 404);
    return lang;
};

const bumpVersion = async (code) => {
    await Language.updateOne({ code }, { $inc: { version: 1 } });
    clearCaches();
};

export const getCatalogPage = async ({ language, namespace, q = '', missingOnly = false, page = 1, limit = 50 }) => {
    assertNamespace(namespace);
    const lang = await requireLanguage(language);
    const catalog = (await loadCatalog())[namespace];
    const rows = await Translation.find({ language: lang.code, namespace }).select('key value -_id').lean();
    const valueOf = new Map(rows.map((r) => [r.key, r.value]));
    const englishRows = lang.code === FALLBACK_LANGUAGE ? valueOf : new Map((await Translation.find({ language: FALLBACK_LANGUAGE, namespace }).select('key value -_id').lean()).map((r) => [r.key, r.value]));

    const needle = String(q || '').trim().toLowerCase();
    const all = [];
    for (const key of catalog) {
        const plural = isPluralKey(key);
        for (const rowKey of rowKeysFor(lang.code, key)) {
            const value = valueOf.get(rowKey) || '';
            const source = plural ? englishRows.get(rowKey) || key : key;
            const missing = lang.code === FALLBACK_LANGUAGE ? plural && !value : !value;
            if (missingOnly && !missing) continue;
            if (needle && !rowKey.toLowerCase().includes(needle) && !value.toLowerCase().includes(needle) && !source.toLowerCase().includes(needle)) continue;
            all.push({ key: rowKey, source, value, missing, plural, placeholders: placeholdersOf(key) });
        }
    }
    const size = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const current = Math.max(Number(page) || 1, 1);
    return { language: lang.code, namespace, total: all.length, page: current, limit: size, rows: all.slice((current - 1) * size, current * size) };
};

/** A plural row is only valid for categories the language actually has (German has no "few"). */
const assertCategoryUsed = (langCode, target) => {
    if (target.category && !pluralCategoriesFor(langCode).includes(target.category)) {
        throw httpError(`"${target.category}" is not a plural form used by ${langCode}`, 404);
    }
};

/** Returns an error message or null. `sourceKey` is the base key a row belongs to. */
const validateValue = ({ rowKey, sourceKey, category, value }) => {
    if (typeof value !== 'string') return 'Value must be text';
    if (value.length > 2000) return 'Value is too long (max 2000 characters)';
    const source = new Set(placeholdersOf(sourceKey));
    const target = placeholdersOf(value);
    const unknown = target.filter((p) => !source.has(p));
    if (unknown.length) return `Unknown placeholder {{${unknown.join('}}, {{')}}} - allowed: ${[...source].map((p) => `{{${p}}}`).join(', ') || 'none'}`;
    if (category === null) {
        const missing = [...source].filter((p) => !target.includes(p));
        if (missing.length) return `Missing placeholder {{${missing.join('}}, {{')}}} - it must appear in the translation`;
    }
    // Formatting tags such as <0>...</0> map to links/bold text in the app: they must all be kept, none invented.
    const sourceTags = tagsOf(sourceKey);
    const targetTags = tagsOf(value);
    if (sourceTags.join('|') !== targetTags.join('|')) {
        return `Formatting tags do not match the English text. Expected: ${sourceTags.join(' ') || 'none'} - found: ${targetTags.join(' ') || 'none'}`;
    }
    return null;
};

export const upsertTranslation = async ({ language, namespace, key, value }) => {
    assertNamespace(namespace);
    const lang = await requireLanguage(language);
    const catalogSet = new Set((await loadCatalog())[namespace]);
    const target = splitRowKey(key, catalogSet);
    if (!target) throw httpError('That string does not exist in the catalog', 404);
    assertCategoryUsed(lang.code, target);

    const text = String(value ?? '').trim();
    if (!text) {
        const res = await Translation.deleteOne({ language: lang.code, namespace, key });
        if (res.deletedCount) await bumpVersion(lang.code);
        return { key, value: '', cleared: true };
    }
    const problem = validateValue({ rowKey: key, sourceKey: target.key, category: target.category, value: text });
    if (problem) throw httpError(problem, 422);

    await Translation.updateOne({ language: lang.code, namespace, key }, { $set: { value: text } }, { upsert: true });
    await bumpVersion(lang.code);
    return { key, value: text };
};

export const importTranslations = async ({ language, namespace, data, dryRun = false, skipInvalid = false }) => {
    assertNamespace(namespace);
    const lang = await requireLanguage(language);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError('Upload a flat JSON object: { "source text": "translation" }', 422);

    const catalogSet = new Set((await loadCatalog())[namespace]);
    const existing = new Map((await Translation.find({ language: lang.code, namespace }).select('key value -_id').lean()).map((r) => [r.key, r.value]));

    const report = { total: 0, toWrite: 0, toClear: 0, unchanged: 0, unknown: [], invalid: [], applied: 0, dryRun: Boolean(dryRun) };
    const writes = [];
    const clears = [];

    for (const [key, raw] of Object.entries(data)) {
        report.total++;
        const target = splitRowKey(key, catalogSet);
        if (!target || (target.category && !pluralCategoriesFor(lang.code).includes(target.category))) {
            report.unknown.push(key);
            continue;
        }
        const text = typeof raw === 'string' ? raw.trim() : raw;
        if (text === '' || text === null) {
            if (existing.has(key)) clears.push(key);
            else report.unchanged++;
            continue;
        }
        const problem = validateValue({ rowKey: key, sourceKey: target.key, category: target.category, value: text });
        if (problem) {
            report.invalid.push({ key, reason: problem });
            continue;
        }
        if (existing.get(key) === text) report.unchanged++;
        else writes.push([key, text]);
    }
    report.toWrite = writes.length;
    report.toClear = clears.length;

    const hasErrors = report.unknown.length > 0 || report.invalid.length > 0;
    if (dryRun) return report;
    if (hasErrors && !skipInvalid) {
        throw httpError(`Nothing was imported: ${report.invalid.length} invalid and ${report.unknown.length} unknown entries. Fix the file or import with "skip invalid".`, 422, { report });
    }

    if (writes.length) {
        await Translation.bulkWrite(writes.map(([key, value]) => ({ updateOne: { filter: { language: lang.code, namespace, key }, update: { $set: { value } }, upsert: true } })), { ordered: false });
    }
    if (clears.length) await Translation.deleteMany({ language: lang.code, namespace, key: { $in: clears } });
    report.applied = writes.length + clears.length;
    if (report.applied) await bumpVersion(lang.code);
    return report;
};

export const exportTranslations = async ({ language, namespace, includeMissing = true }) => {
    assertNamespace(namespace);
    const lang = await requireLanguage(language);
    const catalog = (await loadCatalog())[namespace];
    const rows = await Translation.find({ language: lang.code, namespace }).select('key value -_id').lean();
    const valueOf = new Map(rows.map((r) => [r.key, r.value]));
    const out = {};
    for (const key of catalog) {
        for (const rowKey of rowKeysFor(lang.code, key)) {
            const value = valueOf.get(rowKey);
            if (value) out[rowKey] = value;
            else if (includeMissing) out[rowKey] = '';
        }
    }
    return out;
};

// ─── Server-side translation (push notifications) ─────────────────────────────

/** Describes a message to be translated per recipient. Plain strings are looked up by exact text. */
export const msg = (key, vars = {}, namespace = 'notifications') => ({ __i18n: true, key, vars, namespace });

const namespaceMap = async (code, namespace) => (await loadBundle(code)).namespaces[namespace] || {};

export const translate = async (code, namespace, key, vars = {}) => {
    const chain = code && code !== FALLBACK_LANGUAGE ? [code, FALLBACK_LANGUAGE] : [FALLBACK_LANGUAGE];
    let text;
    for (const lang of chain) {
        const map = await namespaceMap(lang, namespace);
        if (isPluralKey(key) && vars.count !== undefined) {
            const category = new Intl.PluralRules(lang).select(Number(vars.count));
            text = map[`${key}_${category}`] ?? map[`${key}_other`];
        } else {
            text = map[key];
        }
        if (text) break;
    }
    return interpolate(text || key, vars);
};

const localizeField = async (value, code) => {
    if (value && typeof value === 'object' && value.__i18n) return translate(code, value.namespace, value.key, value.vars);
    if (typeof value === 'string') return translate(code, 'notifications', value);
    return value;
};

/** Translates one string for one recipient (used for rows created in bulk, e.g. in-app inbox notifications). */
export const translateFor = async (role, accountId, key, vars = {}, namespace = 'notifications') => {
    await ensureSeeded();
    return translate(await resolveOwnerLanguage(role, accountId), namespace, key, vars);
};

/** Plain-English rendering of a payload, used only if translation itself fails. */
export const toEnglishPayload = (payload = {}) => {
    const out = { ...payload };
    for (const field of ['title', 'body']) {
        const v = out[field];
        if (v && typeof v === 'object' && v.__i18n) out[field] = interpolate(v.key, v.vars);
    }
    return out;
};

/** Translates title/body of a push payload for one recipient language. Unknown text stays as written (English). */
export const localizePayload = async (payload = {}, code = FALLBACK_LANGUAGE) => {
    await ensureSeeded();
    const out = { ...payload };
    for (const field of ['title', 'body']) {
        if (out[field] !== undefined) out[field] = await localizeField(out[field], code);
    }
    return out;
};

// ─── Per-account preference ───────────────────────────────────────────────────

const PREFERENCE_TARGETS = {
    USER: async () => (await import('../../core/users/user.model.js')).FoodUser,
    EMPLOYEE: async () => (await import('../../core/users/user.model.js')).FoodUser,
    RESTAURANT: async () => (await import('../food/restaurant/models/restaurant.model.js')).FoodRestaurant,
    DELIVERY_PARTNER: async () => (await import('../food/delivery/models/deliveryPartner.model.js')).FoodDeliveryPartner,
    OFFICE_ADMIN: async () => (await import('../dailymealbox/office/models/officeAccount.model.js')).OfficeAccount
};

export const getDefaultLanguageCode = async () => {
    const languages = await listLanguages({ enabledOnly: true });
    return (languages.find((l) => l.isDefault) || languages[0])?.code || FALLBACK_LANGUAGE;
};

/** The recipient's chosen language when it is still enabled, otherwise the default language. */
export const resolveOwnerLanguage = async (role, accountId) => {
    const load = PREFERENCE_TARGETS[String(role || '').toUpperCase()];
    if (!load || !accountId) return getDefaultLanguageCode();
    const Model = await load();
    const doc = await Model.findById(accountId).select('languagePreference').lean();
    const code = doc?.languagePreference;
    if (code) {
        const lang = await Language.findOne({ code, isEnabled: true }).select('code').lean();
        if (lang) return lang.code;
    }
    return getDefaultLanguageCode();
};

export const getPreference = async (role, accountId) => {
    const load = PREFERENCE_TARGETS[String(role || '').toUpperCase()];
    if (!load) return { supported: false, language: null };
    const Model = await load();
    const doc = await Model.findById(accountId).select('languagePreference').lean();
    return { supported: true, language: doc?.languagePreference || null };
};

export const setPreference = async (role, accountId, code) => {
    await ensureSeeded();
    const load = PREFERENCE_TARGETS[String(role || '').toUpperCase()];
    if (!load) return { supported: false, language: null };
    const lang = await Language.findOne({ code: String(code || '').toLowerCase(), isEnabled: true }).select('code').lean();
    if (!lang) throw httpError(`Language "${code}" is not available`, 404);
    const Model = await load();
    const res = await Model.updateOne({ _id: accountId }, { $set: { languagePreference: lang.code } });
    if (!res.matchedCount) throw httpError('Account not found', 404);
    return { supported: true, language: lang.code };
};
