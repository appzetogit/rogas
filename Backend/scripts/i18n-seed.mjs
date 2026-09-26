/**
 * Seed-translation tooling.
 *
 *   node scripts/i18n-seed.mjs list <from> <to>     print catalog entries "<index>|<ns>|<English>" (1-based, stable order)
 *   node scripts/i18n-seed.mjs apply <batch.json>   validate and merge a translation batch into seed/translations
 *   node scripts/i18n-seed.mjs check                validate every seed file against the catalog and print coverage
 *   node scripts/i18n-seed.mjs missing <lang>       print indices still untranslated for a language
 *   node scripts/i18n-seed.mjs prune                drop translation rows whose English key is no longer in the catalog
 *
 * A batch is { "<index>": { "pl": "...", "ru": "...", "uk": "...", "de": "..." } }.
 * For a plural entry (the English text contains {{count}}) each language maps to its plural forms:
 *   { "pl": { "one": "...", "few": "...", "many": "...", "other": "..." }, ..., "en": { "one": "...", "other": "..." } }
 * Every string is checked: same {{placeholders}}, same <0>..</0> tags, not empty.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NAMESPACES, isPluralKey, pluralCategoriesFor, placeholdersOf, tagsOf } from '../src/modules/i18n/i18n.service.js';

const SEED = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'modules', 'i18n', 'seed');
const LANGS = ['pl', 'ru', 'uk', 'de'];

const catalog = JSON.parse(fs.readFileSync(path.join(SEED, 'catalog.json'), 'utf8'));
const entries = [];
for (const ns of NAMESPACES) for (const key of catalog[ns] || []) entries.push({ ns, key });

const file = (lang, ns) => path.join(SEED, 'translations', lang, `${ns}.json`);
const read = (lang, ns) => (fs.existsSync(file(lang, ns)) ? JSON.parse(fs.readFileSync(file(lang, ns), 'utf8')) : {});
const write = (lang, ns, obj) => {
  fs.mkdirSync(path.dirname(file(lang, ns)), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file(lang, ns), `${JSON.stringify(sorted, null, 1)}\n`);
};

/** Returns an error message, or null when `value` is a valid translation of `source` (row key `rowKey`). */
const problem = (source, value, { plural }) => {
  if (typeof value !== 'string' || !value.trim()) return 'empty';
  const want = placeholdersOf(source);
  const got = placeholdersOf(value);
  const unknown = got.filter((p) => !want.includes(p));
  if (unknown.length) return `unknown placeholder {{${unknown.join('}}, {{')}}}`;
  if (!plural) {
    const missing = want.filter((p) => !got.includes(p));
    if (missing.length) return `missing placeholder {{${missing.join('}}, {{')}}}`;
  }
  if (tagsOf(source).join('|') !== tagsOf(value).join('|')) return `tags differ (${tagsOf(source).join(' ') || 'none'} vs ${tagsOf(value).join(' ') || 'none'})`;
  return null;
};

const rowsFor = (lang, key, raw) => {
  const plural = isPluralKey(key);
  if (!plural) return { rows: { [key]: raw }, errors: typeof raw === 'string' ? [] : ['expected a string'] };
  const cats = pluralCategoriesFor(lang);
  if (typeof raw !== 'object' || raw === null) return { rows: {}, errors: [`plural entry needs { ${cats.join(', ')} }`] };
  const missing = cats.filter((c) => !raw[c]);
  const extra = Object.keys(raw).filter((c) => !cats.includes(c));
  const errors = [];
  if (missing.length) errors.push(`missing plural forms: ${missing.join(', ')}`);
  if (extra.length) errors.push(`${lang} does not use plural forms: ${extra.join(', ')}`);
  return { rows: Object.fromEntries(cats.filter((c) => raw[c]).map((c) => [`${key}_${c}`, raw[c]])), errors };
};

const cmd = process.argv[2];

if (cmd === 'list') {
  const from = Number(process.argv[3] || 1);
  const to = Number(process.argv[4] || entries.length);
  for (let i = from; i <= Math.min(to, entries.length); i++) {
    const { ns, key } = entries[i - 1];
    console.log(`${i}|${ns}|${isPluralKey(key) ? '[PLURAL] ' : ''}${key}`);
  }
  console.log(`-- ${entries.length} entries total`);
} else if (cmd === 'apply') {
  const batch = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const pending = {}; // "lang/ns" -> rows
  let ok = 0;
  const bad = [];
  for (const [idx, byLang] of Object.entries(batch)) {
    const entry = entries[Number(idx) - 1];
    if (!entry) { bad.push(`${idx}: no such catalog entry`); continue; }
    const plural = isPluralKey(entry.key);
    const langs = plural ? [...LANGS, 'en'] : LANGS;
    for (const lang of langs) {
      if (!(lang in byLang)) { if (lang !== 'en' || plural) bad.push(`${idx} [${lang}] missing`); continue; }
      const { rows, errors } = rowsFor(lang, entry.key, byLang[lang]);
      errors.forEach((e) => bad.push(`${idx} [${lang}] ${e}: ${entry.key.slice(0, 60)}`));
      for (const [rowKey, value] of Object.entries(rows)) {
        const p = problem(entry.key, value, { plural });
        if (p) { bad.push(`${idx} [${lang}] ${p}: ${entry.key.slice(0, 60)} => ${String(value).slice(0, 60)}`); continue; }
        (pending[`${lang}/${entry.ns}`] ||= {})[rowKey] = String(value).trim();
        ok++;
      }
    }
  }
  if (bad.length) {
    console.error(`REJECTED ${bad.length} problems (nothing written):`);
    bad.slice(0, 60).forEach((b) => console.error('  ', b));
    process.exit(1);
  }
  for (const [k, rows] of Object.entries(pending)) {
    const [lang, ns] = k.split('/');
    write(lang, ns, { ...read(lang, ns), ...rows });
  }
  console.log(`applied ${ok} translations from ${path.basename(process.argv[3])}`);
} else if (cmd === 'check' || cmd === 'missing') {
  const lang = process.argv[3];
  const problems = [];
  const stats = {};
  const missingIdx = [];
  for (const l of [...LANGS, 'en']) {
    for (const ns of NAMESPACES) {
      const have = read(l, ns);
      const keys = new Set(catalog[ns] || []);
      for (const rowKey of Object.keys(have)) {
        const base = [...keys].find((k) => rowKey === k || (isPluralKey(k) && /_(zero|one|two|few|many|other)$/.test(rowKey) && rowKey.startsWith(`${k}_`)));
        if (!base) { problems.push(`${l}/${ns}: "${rowKey.slice(0, 60)}" is not in the catalog`); continue; }
        const p = problem(base, have[rowKey], { plural: isPluralKey(base) });
        if (p) problems.push(`${l}/${ns}: ${p}: ${base.slice(0, 60)}`);
      }
    }
  }
  entries.forEach((e, i) => {
    for (const l of LANGS) {
      const have = read(l, e.ns);
      const need = isPluralKey(e.key) ? pluralCategoriesFor(l).map((c) => `${e.key}_${c}`) : [e.key];
      const done = need.every((k) => have[k]);
      stats[l] = stats[l] || { done: 0, total: 0 };
      stats[l].total++;
      if (done) stats[l].done++;
      else if (l === lang) missingIdx.push(i + 1);
    }
  });
  if (cmd === 'missing') {
    console.log(missingIdx.join(','));
  } else {
    for (const l of LANGS) console.log(`${l}: ${stats[l].done}/${stats[l].total} (${Math.round((stats[l].done / stats[l].total) * 100)}%)`);
    if (problems.length) { console.error(`${problems.length} PROBLEMS`); problems.slice(0, 40).forEach((p) => console.error('  ', p)); process.exit(1); }
    console.log('seed files are valid');
  }
} else if (cmd === 'prune') {
  // Drop translation rows whose English key no longer exists in the catalog (source strings that were reworded or removed).
  let removed = 0;
  for (const l of [...LANGS, 'en']) {
    for (const ns of NAMESPACES) {
      const have = read(l, ns);
      const keys = [...(catalog[ns] || [])];
      const kept = {};
      for (const [rowKey, value] of Object.entries(have)) {
        const alive = keys.some((k) => rowKey === k || (isPluralKey(k) && /_(zero|one|two|few|many|other)$/.test(rowKey) && rowKey.startsWith(`${k}_`)));
        if (alive) kept[rowKey] = value; else removed++;
      }
      if (Object.keys(kept).length !== Object.keys(have).length) write(l, ns, kept);
    }
  }
  console.log(`pruned ${removed} orphaned rows`);
} else {
  console.error('usage: list <from> <to> | apply <batch.json> | check | missing <lang> | prune');
  process.exit(2);
}
