/**
 * End-to-end check of the real browser runtime (src/shared/i18n) against the real backend i18n routes.
 *
 * Needs a LOCAL MongoDB (default mongodb://127.0.0.1:27017; override with I18N_TEST_MONGO_URI). It creates a
 * throw-away database and drops it afterwards. It refuses to run against anything that is not a plain local mongod.
 *
 *   node scripts/i18n/runtime.e2e.mjs
 *
 * Covers: English by default, admin-managed language list, switching languages, plural forms, English fallback for
 * missing strings, an admin disabling a language (clients fall back to English) and adding a new one.
 */
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import assert from 'assert';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACK = path.resolve(HERE, '..', '..', '..', 'Backend');
const MONGO = process.env.I18N_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(MONGO)) throw new Error('Refusing to run: I18N_TEST_MONGO_URI must be a plain local mongod');
const req = (await import('module')).createRequire(path.join(BACK, 'x.js'));
const mongoose = req('mongoose');
const express = req('express');

// Browser shims
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const attrs = {};
globalThis.document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } };

await mongoose.connect(`${MONGO.replace(/\/$/, '')}/i18n_rt_${Date.now()}`);
const svc = await import(pathToFileURL(path.join(BACK, 'src/modules/i18n/i18n.service.js')).href);
const { publicI18nRouter } = await import(pathToFileURL(path.join(BACK, 'src/modules/i18n/i18n.routes.js')).href);
const app = express();
app.use(express.json());
app.use('/api/v1/i18n', publicI18nRouter);
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const port = server.address().port;

const axios = (await import('axios')).default;
axios.defaults.baseURL = `http://127.0.0.1:${port}`;

const rt = await import(pathToFileURL(path.join(HERE, '..', '..', 'src', 'shared', 'i18n', 'index.js')).href);
const i18n = rt.default;
const T = (key, opts = {}) => i18n.t(key, opts);
let failed = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
};

try {
  // 1. Fresh visitor: English by default, no requests needed for English text
  check('fresh visitor is English', rt.getCurrentLanguage(), 'en');
  check('English text is the key', T('Cancel', { ns: 'common' }), 'Cancel');

  // 2. Languages come from the admin-managed list
  await rt.syncLanguages();
  check('language list from backend', rt.getLanguageList().languages.map((l) => l.code), ['en', 'pl', 'ru', 'uk', 'de']);
  check('default language from backend is en', rt.getLanguageList().defaultLanguage, 'en');

  // 3. Switch to each language
  await rt.setLanguage('pl', { panel: null, persistToAccount: false });
  check('pl: current language', rt.getCurrentLanguage(), 'pl');
  check('pl: <html lang>', attrs.lang, 'pl');
  check('pl: common string', T('Cancel', { ns: 'common' }), 'Anuluj');
  check('pl: plural 1', T('Pause {{count}} Day', { ns: 'customer', count: 1 }), 'Wstrzymaj na 1 dzień');
  check('pl: plural 3', T('Pause {{count}} Day', { ns: 'customer', count: 3 }), 'Wstrzymaj na 3 dni');
  check('pl: plural 5', T('Pause {{count}} Day', { ns: 'customer', count: 5 }), 'Wstrzymaj na 5 dni');
  check('pl: interpolation', T('Order #{{orderId}}', { ns: 'driver', orderId: 'A7' }), 'Zamówienie #A7');
  check('pl: cached in localStorage', JSON.parse(store.get('i18n_bundle_pl')).version >= 1, true);
  check('pl: choice remembered', store.get('app_lang'), 'pl');
  await rt.setLanguage('pl', { panel: 'user' }); // signed out: no token, so the choice must be queued for the next sign-in
  check('pl: unsynced flag set (signed out)', localStorage.getItem('app_lang_unsynced'), '1');

  // 4. A string with no translation falls back to English (with interpolation)
  check('missing key falls back to English', T('Totally new sentence for {{who}}', { ns: 'customer', who: 'Ola' }), 'Totally new sentence for Ola');

  await rt.setLanguage('ru', { panel: null, persistToAccount: false });
  check('ru: common string', T('Cancel', { ns: 'common' }), 'Отмена');
  check('ru: plural 2', T('Pause {{count}} Day', { ns: 'customer', count: 2 }), 'Приостановить на 2 дня');
  check('ru: plural 11', T('Pause {{count}} Day', { ns: 'customer', count: 11 }), 'Приостановить на 11 дней');
  await rt.setLanguage('uk', { panel: null, persistToAccount: false });
  check('uk: plural 21', T('Pause {{count}} Day', { ns: 'customer', count: 21 }), 'Призупинити на 21 день');
  await rt.setLanguage('de', { panel: null, persistToAccount: false });
  check('de: common string', T('Cancel', { ns: 'common' }), 'Abbrechen');
  check('de: plural 2', T('Pause {{count}} Day', { ns: 'customer', count: 2 }), '2 Tage pausieren');
  await rt.setLanguage('en', { panel: null, persistToAccount: false });
  check('back to English', T('Cancel', { ns: 'common' }), 'Cancel');

  // 5. Admin disables a language: clients drop it and fall back to English on next sync
  await rt.setLanguage('pl', { panel: null, persistToAccount: false });
  const pl = (await svc.listLanguages()).find((l) => l.code === 'pl');
  await svc.updateLanguage(String(pl._id), { isEnabled: false });
  await rt.syncLanguages();
  check('disabled language disappears from the list', rt.getLanguageList().languages.map((l) => l.code), ['en', 'ru', 'uk', 'de']);
  check('client falls back to English', rt.getCurrentLanguage(), 'en');
  check('stale choice cleared', localStorage.getItem('app_lang'), null);
  let threw = false;
  try { await rt.setLanguage('pl', { panel: null, persistToAccount: false }); } catch { threw = true; }
  check('cannot select a disabled language', threw, true);

  // 6. Admin adds a new language (Czech) with one translated string: it appears, and the rest falls back to English
  const cs = await svc.createLanguage({ code: 'cs', name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿' });
  await svc.upsertTranslation({ language: 'cs', namespace: 'common', key: 'Cancel', value: 'Zrušit' });
  await rt.syncLanguages();
  check('new language appears', rt.getLanguageList().languages.some((l) => l.code === 'cs'), true);
  await rt.setLanguage('cs', { panel: null, persistToAccount: false });
  check('cs: translated string', T('Cancel', { ns: 'common' }), 'Zrušit');
  check('cs: untranslated string shows English', T('Save', { ns: 'common' }), 'Save');
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();
}
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nall client-runtime checks passed');
process.exit(failed ? 1 : 0);
