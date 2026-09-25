/**
 * Integration tests for the multi-language module.
 *
 * Needs a LOCAL MongoDB (default mongodb://127.0.0.1:27017). It creates a throw-away database and drops it
 * afterwards. It refuses to run against anything that is not localhost so it can never touch a real cluster.
 *
 *   mongod --dbpath <empty dir> --port 27017
 *   node --test tests/i18n.test.mjs
 *   (custom port)  I18N_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/i18n.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';

const BASE_URI = process.env.I18N_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE_URI)) {
    throw new Error(`Refusing to run: I18N_TEST_MONGO_URI must be a plain local mongod (got ${BASE_URI.replace(/\/\/.*@/, '//***@')})`);
}
const DB_NAME = `i18n_test_${Date.now()}`;

let seedDir;
let svc;
let server;
let baseUrl;

const writeSeed = async (catalog, translations) => {
    await fs.rm(seedDir, { recursive: true, force: true });
    await fs.mkdir(path.join(seedDir, 'translations'), { recursive: true });
    await fs.writeFile(path.join(seedDir, 'catalog.json'), JSON.stringify(catalog));
    for (const [lang, byNs] of Object.entries(translations)) {
        await fs.mkdir(path.join(seedDir, 'translations', lang), { recursive: true });
        for (const [ns, map] of Object.entries(byNs)) {
            await fs.writeFile(path.join(seedDir, 'translations', lang, `${ns}.json`), JSON.stringify(map));
        }
    }
};

const CATALOG = {
    common: ['Save', 'Cancel'],
    customer: ['Delivery Time Slots', 'Hello, {{name}}!', '{{count}} meal'],
    vendor: ['Orders'],
    driver: [],
    office: [],
    notifications: ['Driver is on the way!', 'Your meal plan starts {{startDate}}.']
};
const PL = {
    common: { Save: 'Zapisz' },
    customer: { 'Delivery Time Slots': 'Terminy dostawy', 'Hello, {{name}}!': 'Cześć, {{name}}!', '{{count}} meal_one': '{{count}} posiłek', '{{count}} meal_few': '{{count}} posiłki', '{{count}} meal_many': '{{count}} posiłków', '{{count}} meal_other': '{{count}} posiłku' },
    notifications: { 'Driver is on the way!': 'Kierowca jest w drodze!', 'Your meal plan starts {{startDate}}.': 'Twój plan posiłków zaczyna się {{startDate}}.' }
};
const EN = { customer: { '{{count}} meal_one': '{{count}} meal', '{{count}} meal_other': '{{count}} meals' } };

before(async () => {
    seedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-seed-'));
    await writeSeed(CATALOG, { pl: PL, en: EN });
    process.env.I18N_SEED_DIR = seedDir;
    await mongoose.connect(BASE_URI, { dbName: DB_NAME });
    svc = await import('../src/modules/i18n/i18n.service.js');
    await svc.ensureSeeded();

    const { publicI18nRouter } = await import('../src/modules/i18n/i18n.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/v1/i18n', publicI18nRouter);
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((r) => (server ? server.close(r) : r()));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await fs.rm(seedDir, { recursive: true, force: true });
});

const langByCode = async (code) => (await svc.listLanguages()).find((l) => l.code === code);
const rejects = (promise, status, pattern) => assert.rejects(promise, (e) => { assert.equal(e.statusCode, status, e.message); if (pattern) assert.match(e.message, pattern); return true; });

test('seeds the five languages with English as system default', async () => {
    const langs = await svc.listLanguages();
    assert.deepEqual(langs.map((l) => l.code), ['en', 'pl', 'ru', 'uk', 'de']);
    const en = langs.find((l) => l.code === 'en');
    assert.equal(en.isSystem, true);
    assert.equal(en.isDefault, true);
    assert.equal(langs.filter((l) => l.isDefault).length, 1);
});

test('seed is idempotent and never overwrites admin edits', async () => {
    await svc.upsertTranslation({ language: 'pl', namespace: 'common', key: 'Save', value: 'Zachowaj' });
    await svc.resyncSeed();
    const page = await svc.getCatalogPage({ language: 'pl', namespace: 'common', q: 'Save' });
    assert.equal(page.rows.find((r) => r.key === 'Save').value, 'Zachowaj');
});

test('a changed seed adds new keys and drops keys removed from the code', async () => {
    await writeSeed({ ...CATALOG, common: ['Save', 'Cancel', 'Close'] }, { pl: { ...PL, common: { Save: 'Zapisz', Close: 'Zamknij' } }, en: EN });
    await svc.resyncSeed();
    const page = await svc.getCatalogPage({ language: 'pl', namespace: 'common' });
    assert.deepEqual(page.rows.map((r) => r.key).sort(), ['Cancel', 'Close', 'Save']);
    assert.equal(page.rows.find((r) => r.key === 'Close').value, 'Zamknij');
    assert.equal(page.rows.find((r) => r.key === 'Save').value, 'Zachowaj', 'admin edit survives');

    await writeSeed(CATALOG, { pl: PL, en: EN });
    await svc.resyncSeed();
    const after = await svc.getCatalogPage({ language: 'pl', namespace: 'common' });
    assert.deepEqual(after.rows.map((r) => r.key).sort(), ['Cancel', 'Save']);
    const bundle = await svc.getBundle('pl');
    assert.equal(bundle.namespaces.common.Close, undefined, 'translation of removed key is purged');
});

test('language list and bundles honour enabled state', async () => {
    let pub = await svc.getPublicLanguages();
    assert.deepEqual(pub.languages.map((l) => l.code), ['en', 'pl', 'ru', 'uk', 'de']);
    assert.equal(pub.defaultLanguage, 'en');
    assert.equal(pub.fallbackLanguage, 'en');

    const de = await langByCode('de');
    await svc.updateLanguage(de._id, { isEnabled: false });
    pub = await svc.getPublicLanguages();
    assert.ok(!pub.languages.some((l) => l.code === 'de'));
    await rejects(svc.getBundle('de'), 404);

    await svc.updateLanguage(de._id, { isEnabled: true });
    assert.ok((await svc.getPublicLanguages()).languages.some((l) => l.code === 'de'));
});

test('English cannot be disabled or deleted, and the default cannot be removed', async () => {
    const en = await langByCode('en');
    await rejects(svc.updateLanguage(en._id, { isEnabled: false }), 409, /fallback/);
    await rejects(svc.deleteLanguage(en._id), 409, /fallback/);

    const pl = await langByCode('pl');
    await svc.updateLanguage(pl._id, { isDefault: true });
    assert.equal((await svc.getPublicLanguages()).defaultLanguage, 'pl');
    await rejects(svc.deleteLanguage(pl._id), 409, /default/);
    await rejects(svc.updateLanguage(pl._id, { isEnabled: false }), 409, /default/);
    await svc.updateLanguage(en._id, { isDefault: true });
    assert.equal((await svc.getPublicLanguages()).defaultLanguage, 'en');
});

test('admin can add a language, then delete it once nobody uses it', async () => {
    const cs = await svc.createLanguage({ code: 'CS', name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿' });
    assert.equal(cs.code, 'cs');
    assert.equal(cs.isSystem, false);
    await rejects(svc.createLanguage({ code: 'cs', name: 'Czech', nativeName: 'Čeština' }), 409, /already exists/);
    await rejects(svc.createLanguage({ code: 'not a code', name: 'X', nativeName: 'X' }), 400, /code/);
    await rejects(svc.createLanguage({ code: 'xx', name: '', nativeName: 'X' }), 400, /name/i);
    await rejects(svc.createLanguage({ code: 'xx', name: 'X' }), 400, /Native name/);

    await svc.upsertTranslation({ language: 'cs', namespace: 'common', key: 'Save', value: 'Uložit' });
    assert.equal((await svc.getBundle('cs')).namespaces.common.Save, 'Uložit');

    // An account that chose Czech blocks deletion (this is the "disable, don't delete" guard).
    const { FoodUser } = await import('../src/core/users/user.model.js');
    const inserted = await FoodUser.collection.insertOne({ name: 'Test', phone: '+48000000001', languagePreference: 'cs', role: 'USER' });
    const err = await svc.deleteLanguage(cs._id).catch((e) => e);
    assert.equal(err.statusCode, 409);
    assert.equal(err.usage.customers, 1);
    assert.match(err.message, /Disable it instead/);

    await FoodUser.collection.deleteOne({ _id: inserted.insertedId });
    await svc.deleteLanguage(cs._id);
    assert.equal(await langByCode('cs'), undefined);
    const { Translation } = await import('../src/modules/i18n/translation.model.js');
    assert.equal(await Translation.countDocuments({ language: 'cs' }), 0, 'translations are removed with the language');
});

test('editing a translation validates placeholders and bumps the version', async () => {
    const v0 = (await langByCode('pl')).version;
    await svc.upsertTranslation({ language: 'pl', namespace: 'customer', key: 'Hello, {{name}}!', value: 'Witaj, {{name}}!' });
    const v1 = (await langByCode('pl')).version;
    assert.ok(v1 > v0, 'version increases on change');

    await rejects(svc.upsertTranslation({ language: 'pl', namespace: 'customer', key: 'Hello, {{name}}!', value: 'Witaj!' }), 422, /Missing placeholder/);
    await rejects(svc.upsertTranslation({ language: 'pl', namespace: 'customer', key: 'Hello, {{name}}!', value: 'Witaj, {{user}}!' }), 422, /Unknown placeholder/);
    await rejects(svc.upsertTranslation({ language: 'pl', namespace: 'customer', key: 'No such string', value: 'x' }), 404);
    await rejects(svc.upsertTranslation({ language: 'zz', namespace: 'customer', key: 'Hello, {{name}}!', value: 'x' }), 404);
    await rejects(svc.upsertTranslation({ language: 'pl', namespace: 'bogus', key: 'Save', value: 'x' }), 400, /namespace/);

    assert.equal((await langByCode('pl')).version, v1, 'failed writes do not bump the version');
});

test('clearing a translation falls back to English', async () => {
    await svc.upsertTranslation({ language: 'pl', namespace: 'common', key: 'Save', value: '' });
    assert.equal((await svc.getBundle('pl')).namespaces.common.Save, undefined);
    assert.equal(await svc.translate('pl', 'common', 'Save'), 'Save');
    await svc.upsertTranslation({ language: 'pl', namespace: 'common', key: 'Save', value: 'Zapisz' });
});

test('bundle only contains requested namespaces and reports version', async () => {
    const b = await svc.getBundle('pl', { namespaces: ['common'] });
    assert.deepEqual(Object.keys(b.namespaces), ['common']);
    assert.equal(typeof b.version, 'number');
    const full = await svc.getBundle('pl');
    assert.deepEqual(Object.keys(full.namespaces).sort(), ['common', 'customer', 'driver', 'office', 'vendor']);
    assert.ok(!('notifications' in full.namespaces), 'server-only namespace is not shipped to apps by default');
});

test('plural strings expand to the language plural categories', async () => {
    const pl = await svc.getCatalogPage({ language: 'pl', namespace: 'customer', q: 'meal' });
    assert.deepEqual(pl.rows.map((r) => r.key).sort(), ['{{count}} meal_few', '{{count}} meal_many', '{{count}} meal_one', '{{count}} meal_other']);
    assert.ok(pl.rows.every((r) => r.plural));
    const de = await svc.getCatalogPage({ language: 'de', namespace: 'customer', q: 'meal' });
    assert.deepEqual(de.rows.map((r) => r.key).sort(), ['{{count}} meal_one', '{{count}} meal_other']);
    assert.ok(de.rows.every((r) => r.missing));

    await svc.upsertTranslation({ language: 'de', namespace: 'customer', key: '{{count}} meal_one', value: '{{count}} Mahlzeit' });
    await rejects(svc.upsertTranslation({ language: 'de', namespace: 'customer', key: '{{count}} meal_few', value: 'x' }), 404, undefined);
});

test('translate() picks plural forms, interpolates, and falls back to English then the key', async () => {
    assert.equal(await svc.translate('pl', 'customer', '{{count}} meal', { count: 1 }), '1 posiłek');
    assert.equal(await svc.translate('pl', 'customer', '{{count}} meal', { count: 3 }), '3 posiłki');
    assert.equal(await svc.translate('pl', 'customer', '{{count}} meal', { count: 5 }), '5 posiłków');
    assert.equal(await svc.translate('en', 'customer', '{{count}} meal', { count: 1 }), '1 meal');
    assert.equal(await svc.translate('en', 'customer', '{{count}} meal', { count: 2 }), '2 meals');
    // Russian has no seeded plural rows -> English rows are used.
    assert.equal(await svc.translate('ru', 'customer', '{{count}} meal', { count: 2 }), '2 meals');
    assert.equal(await svc.translate('pl', 'customer', 'Hello, {{name}}!', { name: 'Anna' }), 'Witaj, Anna!');
    assert.equal(await svc.translate('ru', 'customer', 'Hello, {{name}}!', { name: 'Anna' }), 'Hello, Anna!', 'missing translation shows English');
    assert.equal(await svc.translate('pl', 'customer', 'Unknown text {{x}}', { x: 1 }), 'Unknown text 1', 'unknown key shows itself');
});

test('import: dry run reports, invalid files are rejected as a whole, skipInvalid applies the valid part', async () => {
    const file = { 'Delivery Time Slots': 'Okna dostawy', 'Hello, {{name}}!': 'Cześć!', 'Not in catalog': 'x', Save: 'Zapisz teraz' };

    const dry = await svc.importTranslations({ language: 'pl', namespace: 'customer', data: file, dryRun: true });
    assert.equal(dry.dryRun, true);
    assert.equal(dry.applied, 0);
    assert.equal(dry.toWrite, 1);
    assert.equal(dry.invalid.length, 1);
    assert.deepEqual(dry.unknown.sort(), ['Not in catalog', 'Save']);
    assert.equal((await svc.getBundle('pl')).namespaces.customer['Delivery Time Slots'], 'Terminy dostawy', 'dry run wrote nothing');

    const err = await svc.importTranslations({ language: 'pl', namespace: 'customer', data: file }).catch((e) => e);
    assert.equal(err.statusCode, 422);
    assert.equal(err.report.applied, 0);
    assert.equal((await svc.getBundle('pl')).namespaces.customer['Delivery Time Slots'], 'Terminy dostawy', 'nothing imported on error');

    const ok = await svc.importTranslations({ language: 'pl', namespace: 'customer', data: file, skipInvalid: true });
    assert.equal(ok.applied, 1);
    assert.equal((await svc.getBundle('pl')).namespaces.customer['Delivery Time Slots'], 'Okna dostawy');

    await rejects(svc.importTranslations({ language: 'pl', namespace: 'customer', data: ['a'] }), 422, /flat JSON object/);
    await rejects(svc.importTranslations({ language: 'pl', namespace: 'customer', data: 'x' }), 422);
});

test('import can clear a translation with an empty string', async () => {
    const res = await svc.importTranslations({ language: 'pl', namespace: 'customer', data: { 'Delivery Time Slots': '' } });
    assert.equal(res.toClear, 1);
    assert.equal((await svc.getBundle('pl')).namespaces.customer['Delivery Time Slots'], undefined);
});

test('export lists every expected row, blank when missing', async () => {
    const out = await svc.exportTranslations({ language: 'pl', namespace: 'customer' });
    assert.ok('Delivery Time Slots' in out);
    assert.equal(out['Delivery Time Slots'], '');
    assert.equal(out['Hello, {{name}}!'], 'Witaj, {{name}}!');
    assert.ok('{{count}} meal_few' in out);
    const translatedOnly = await svc.exportTranslations({ language: 'pl', namespace: 'customer', includeMissing: false });
    assert.ok(!('Delivery Time Slots' in translatedOnly));
});

test('catalog page filters, searches and paginates', async () => {
    const missing = await svc.getCatalogPage({ language: 'pl', namespace: 'customer', missingOnly: true });
    assert.ok(missing.rows.every((r) => r.missing));
    assert.ok(missing.rows.some((r) => r.key === 'Delivery Time Slots'));
    const search = await svc.getCatalogPage({ language: 'pl', namespace: 'customer', q: 'witaj' });
    assert.equal(search.rows.length, 1);
    const paged = await svc.getCatalogPage({ language: 'pl', namespace: 'customer', limit: 2, page: 2 });
    assert.equal(paged.total, 6, 'two plain keys + four Polish plural forms');
    assert.equal(paged.rows.length, 2);
    const last = await svc.getCatalogPage({ language: 'pl', namespace: 'customer', limit: 4, page: 2 });
    assert.equal(last.rows.length, 2);
});

test('stats report completion per language', async () => {
    const stats = await svc.getLanguageStats();
    const en = stats.find((s) => s.code === 'en');
    const pl = stats.find((s) => s.code === 'pl');
    const ru = stats.find((s) => s.code === 'ru');
    assert.equal(en.percent, 100);
    assert.ok(pl.percent > ru.percent, 'pl has more strings translated than ru');
    assert.ok(pl.total > 0 && pl.translated <= pl.total);
});

test('push payloads are localized per recipient, with English fallback', async () => {
    const payload = { title: 'Driver is on the way!', body: svc.msg('Your meal plan starts {{startDate}}.', { startDate: '2026-10-01' }), data: { x: '1' } };
    const pl = await svc.localizePayload(payload, 'pl');
    assert.equal(pl.title, 'Kierowca jest w drodze!');
    assert.equal(pl.body, 'Twój plan posiłków zaczyna się 2026-10-01.');
    assert.deepEqual(pl.data, { x: '1' });

    const ru = await svc.localizePayload(payload, 'ru');
    assert.equal(ru.title, 'Driver is on the way!');
    assert.equal(ru.body, 'Your meal plan starts 2026-10-01.');

    assert.equal(svc.toEnglishPayload(payload).body, 'Your meal plan starts 2026-10-01.');
    assert.equal((await svc.localizePayload({ title: 'Some free text' }, 'pl')).title, 'Some free text');
});

test('recipient language: preference when enabled, otherwise the default', async () => {
    const { FoodUser } = await import('../src/core/users/user.model.js');
    const { FoodDeliveryPartner } = await import('../src/modules/food/delivery/models/deliveryPartner.model.js');
    const u = await FoodUser.collection.insertOne({ name: 'U', phone: '+48000000002', languagePreference: 'pl', role: 'USER' });
    const d = await FoodDeliveryPartner.collection.insertOne({ name: 'D', phone: '+48000000003', languagePreference: 'ru' });
    const none = await FoodUser.collection.insertOne({ name: 'N', phone: '+48000000004', role: 'USER' });

    assert.equal(await svc.resolveOwnerLanguage('USER', u.insertedId), 'pl');
    assert.equal(await svc.resolveOwnerLanguage('EMPLOYEE', u.insertedId), 'pl');
    assert.equal(await svc.resolveOwnerLanguage('DELIVERY_PARTNER', d.insertedId), 'ru');
    assert.equal(await svc.resolveOwnerLanguage('USER', none.insertedId), 'en');
    assert.equal(await svc.resolveOwnerLanguage('ADMIN', none.insertedId), 'en');
    assert.equal(await svc.resolveOwnerLanguage('USER', new mongoose.Types.ObjectId()), 'en');

    const ruLang = await langByCode('ru');
    await svc.updateLanguage(ruLang._id, { isEnabled: false });
    assert.equal(await svc.resolveOwnerLanguage('DELIVERY_PARTNER', d.insertedId), 'en', 'disabled language falls back to default');
    await svc.updateLanguage(ruLang._id, { isEnabled: true });
});

test('setPreference stores an enabled language per account type and rejects the rest', async () => {
    const { FoodUser } = await import('../src/core/users/user.model.js');
    const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');
    const { OfficeAccount } = await import('../src/modules/dailymealbox/office/models/officeAccount.model.js');
    const u = await FoodUser.collection.insertOne({ name: 'U2', phone: '+48000000005', role: 'USER' });
    const r = await FoodRestaurant.collection.insertOne({ restaurantName: 'R', phone: '+48000000006', email: 'r@example.com' });
    const o = await OfficeAccount.collection.insertOne({ email: 'o@example.com', password: 'x' });

    assert.deepEqual(await svc.setPreference('USER', u.insertedId, 'DE'), { supported: true, language: 'de' });
    assert.deepEqual(await svc.setPreference('RESTAURANT', r.insertedId, 'uk'), { supported: true, language: 'uk' });
    assert.deepEqual(await svc.setPreference('OFFICE_ADMIN', o.insertedId, 'pl'), { supported: true, language: 'pl' });
    assert.equal((await svc.getPreference('USER', u.insertedId)).language, 'de');
    assert.equal((await FoodRestaurant.collection.findOne({ _id: r.insertedId })).languagePreference, 'uk');
    assert.equal((await OfficeAccount.collection.findOne({ _id: o.insertedId })).languagePreference, 'pl');

    await rejects(svc.setPreference('USER', u.insertedId, 'xx'), 404, /not available/);
    await rejects(svc.setPreference('USER', new mongoose.Types.ObjectId(), 'de'), 404, /Account not found/);
    assert.deepEqual(await svc.setPreference('ADMIN', u.insertedId, 'de'), { supported: false, language: null });
});

test('HTTP: public languages and bundle endpoints, including "not modified"', async () => {
    const langs = await (await fetch(`${baseUrl}/v1/i18n/languages`)).json();
    assert.equal(langs.success, true);
    assert.equal(langs.defaultLanguage, 'en');
    assert.ok(langs.languages.find((l) => l.code === 'pl').nativeName === 'Polski');

    const b = await (await fetch(`${baseUrl}/v1/i18n/bundle/pl?ns=common,customer`)).json();
    assert.equal(b.success, true);
    assert.deepEqual(Object.keys(b.namespaces).sort(), ['common', 'customer']);
    assert.equal(b.namespaces.customer['Hello, {{name}}!'], 'Witaj, {{name}}!');

    const same = await (await fetch(`${baseUrl}/v1/i18n/bundle/pl?since=${b.version}`)).json();
    assert.equal(same.notModified, true);
    assert.equal(same.namespaces, undefined);

    const stale = await (await fetch(`${baseUrl}/v1/i18n/bundle/pl?since=${b.version - 1}`)).json();
    assert.ok(stale.namespaces, 'an older version gets the full bundle');

    const missing = await fetch(`${baseUrl}/v1/i18n/bundle/zz`);
    assert.equal(missing.status, 404);
});

test('HTTP admin API: CRUD, guards and validation reports (through the real RBAC middleware)', async () => {
    const { FoodAdmin } = await import('../src/core/admin/admin.model.js');
    const { adminI18nRouter } = await import('../src/modules/i18n/i18n.routes.js');
    const admin = await FoodAdmin.collection.insertOne({ name: 'Root', email: 'root@example.com', adminRole: 'SUPER_ADMIN', isActive: true });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { userId: String(admin.insertedId), _id: String(admin.insertedId), role: 'ADMIN' }; next(); });
    app.use('/admin/i18n', adminI18nRouter);
    const srv = http.createServer(app);
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${srv.address().port}/admin/i18n`;
    const call = async (method, p, body) => {
        const res = await fetch(`${url}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json() };
    };

    try {
        const list = await call('GET', '/languages');
        assert.equal(list.status, 200);
        assert.ok(list.body.languages.length >= 5);
        assert.equal(list.body.fallbackLanguage, 'en');
        assert.ok(list.body.stats.every((s) => typeof s.percent === 'number'));
        assert.ok(list.body.namespaces.includes('notifications'));

        const created = await call('POST', '/languages', { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', flag: '🇸🇰' });
        assert.equal(created.status, 200);
        const id = created.body.language._id;
        assert.equal((await call('POST', '/languages', { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' })).status, 409);
        assert.equal((await call('POST', '/languages', { code: 'bad code', name: 'x', nativeName: 'x' })).status, 400);

        assert.equal((await call('PUT', `/languages/${id}`, { nativeName: 'Slovenský' })).body.language.nativeName, 'Slovenský');
        const en = list.body.languages.find((l) => l.code === 'en');
        const blocked = await call('PUT', `/languages/${en._id}`, { isEnabled: false });
        assert.equal(blocked.status, 409);
        assert.equal(blocked.body.success, false);

        const put = await call('PUT', '/translations', { language: 'sk', namespace: 'common', key: 'Save', value: 'Uložiť' });
        assert.equal(put.status, 200);
        assert.equal(put.body.translation.value, 'Uložiť');
        assert.equal((await call('PUT', '/translations', { language: 'sk', namespace: 'customer', key: 'Hello, {{name}}!', value: 'Ahoj!' })).status, 422);

        const page = await call('GET', '/translations?language=sk&namespace=common&limit=10');
        assert.equal(page.status, 200);
        assert.equal(page.body.rows.find((r) => r.key === 'Save').value, 'Uložiť');
        const missing = await call('GET', '/translations?language=sk&namespace=common&missingOnly=true');
        assert.ok(missing.body.rows.every((r) => r.missing));
        assert.equal((await call('GET', '/translations?language=sk&namespace=nope')).status, 400);
        assert.equal((await call('GET', '/translations?language=zz&namespace=common')).status, 404);

        const dry = await call('POST', '/translations/import', { language: 'sk', namespace: 'customer', dryRun: true, data: { 'Delivery Time Slots': 'Časy doručenia', 'Hello, {{name}}!': 'Ahoj!' } });
        assert.equal(dry.status, 200);
        assert.equal(dry.body.report.invalid.length, 1);
        const rejected = await call('POST', '/translations/import', { language: 'sk', namespace: 'customer', data: { 'Hello, {{name}}!': 'Ahoj!' } });
        assert.equal(rejected.status, 422);
        assert.equal(rejected.body.report.invalid[0].key, 'Hello, {{name}}!');
        const imported = await call('POST', '/translations/import', { language: 'sk', namespace: 'customer', skipInvalid: true, data: { 'Delivery Time Slots': 'Časy doručenia', 'Hello, {{name}}!': 'Ahoj!' } });
        assert.equal(imported.body.report.applied, 1);

        const exp = await call('GET', '/translations/export?language=sk&namespace=customer');
        assert.equal(exp.body.data['Delivery Time Slots'], 'Časy doručenia');
        assert.equal(exp.body.data['Hello, {{name}}!'], '');

        assert.equal((await call('DELETE', `/languages/${id}`)).body.deleted, true);
        assert.equal((await call('DELETE', `/languages/${id}`)).status, 404);
    } finally {
        await new Promise((r) => srv.close(r));
    }
});
