/**
 * Differential render test: the transformed component must render EXACTLY the same HTML in English as the
 * original, and must pick up translations (including re-ordered inline tags) in another language.
 *
 *   node --test scripts/i18n/render.test.mjs
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { processSource } from './codemod.mjs';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.join(HERE, '.render-tmp');
fs.mkdirSync(TMP, { recursive: true });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let counter = 0;
const load = async (source) => {
  const { code } = esbuild.transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'esm' });
  const file = path.join(TMP, `case-${++counter}.mjs`);
  fs.writeFileSync(file, code);
  return (await import(pathToFileURL(file).href)).default;
};

const makeI18n = async (lng, resources = {}) => {
  const inst = i18next.createInstance();
  await inst.init({
    lng,
    fallbackLng: 'en',
    ns: ['customer', 'common'],
    defaultNS: 'common',
    fallbackNS: 'common',
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    returnNull: false,
    interpolation: { escapeValue: false },
    resources,
    initAsync: false,
    react: { useSuspense: false },
  });
  return inst;
};

const html = (Comp, props, inst) =>
  renderToStaticMarkup(inst ? React.createElement(I18nextProvider, { i18n: inst }, React.createElement(Comp, props)) : React.createElement(Comp, props));

const cases = [
  {
    name: 'plain text, attributes and ternaries',
    src: `export default function C({ busy }) {
  return (
    <form>
      <h1>Delivery Time Slots</h1>
      <input placeholder="Search meals" title="Find a meal" className="x" />
      <button>{busy ? 'Sending...' : 'Send'}</button>
    </form>
  );
}`,
    props: { busy: false },
    pl: { customer: { 'Delivery Time Slots': 'Terminy dostawy', 'Search meals': 'Szukaj posiłków', 'Find a meal': 'Znajdź posiłek', Send: 'Wyślij' } },
    expectPl: [/<h1>Terminy dostawy<\/h1>/, /placeholder="Szukaj posiłków"/, /title="Znajdź posiłek"/, /<button>Wyślij<\/button>/, /class="x"/],
  },
  {
    name: 'text with interpolated expressions and multi-line JSX text',
    src: `export default function C({ name, user }) {
  return (
    <div>
      <p>Hello, {name}! You have {user.count} meals.</p>
      <p>
        First line
        second line
      </p>
    </div>
  );
}`,
    props: { name: 'Anna', user: { count: 3 } },
    pl: { customer: { 'Hello, {{name}}! You have {{count}} meals.': 'Cześć, {{name}}! Masz {{count}} posiłki.', 'First line second line': 'Pierwsza linia druga linia' } },
    expectPl: [/Cześć, Anna! Masz 3 posiłki\./, /Pierwsza linia druga linia/],
  },
  {
    name: 'sentence with inline tags: tags can be re-ordered by the translation',
    src: `export default function C({ plan, date }) {
  return <p>Your <strong className="b">{plan}</strong> plan starts on <em>{date}</em>.</p>;
}`,
    props: { plan: 'Weekly', date: '1 Oct' },
    pl: { customer: { 'Your <0>{{plan}}</0> plan starts on <1>{{date}}</1>.': 'Zaczynamy <1>{{date}}</1>: Twój plan <0>{{plan}}</0>.' } },
    expectPl: [/^<p>Zaczynamy <em>1 Oct<\/em>: Twój plan <strong class="b">Weekly<\/strong>\.<\/p>$/],
  },
  {
    name: 'links inside a sentence keep their attributes',
    src: `export default function C() {
  return <p>I agree to the <a href="/terms" className="link">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>;
}`,
    props: {},
    pl: { customer: { 'I agree to the <0>Terms</0> and <1>Privacy Policy</1>.': 'Akceptuję <0>Regulamin</0> oraz <1>Politykę prywatności</1>.' } },
    expectPl: [/Akceptuję <a href="\/terms" class="link">Regulamin<\/a> oraz <a href="\/privacy">Politykę prywatności<\/a>\./],
  },
  {
    name: 'quotes, backslashes and ampersands inside a Trans sentence',
    src: `export default function C({ name }) {
  return <p>Proceed with <strong>"{name}"</strong>? Tom &amp; Jerry said "no" \ yes.</p>;
}`,
    props: { name: 'Plan A' },
    pl: { customer: { 'Proceed with <0>"{{name}}"</0>? Tom & Jerry said "no" \ yes.': 'Kontynuować z <0>"{{name}}"</0>? Tom & Jerry powiedzieli "nie" \ tak.' } },
    expectPl: [/Kontynuować z <strong>&quot;Plan A&quot;<\/strong>\? Tom &amp; Jerry powiedzieli &quot;nie&quot; \ tak\./],
  },
  {
    name: 'date formatting chains and {" "} spacers stay inside one sentence',
    src: `export default function C({ d }) {
  return (
    <p>
      Your delivery for{" "}
      {new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}{" "}
      will be skipped.
    </p>
  );
}`,
    props: { d: '2026-10-05T00:00:00Z' },
    pl: { customer: { 'Your delivery for {{date}} will be skipped.': 'Dostawa na {{date}} zostanie pominięta.' } },
    expectPl: [/^<p>Dostawa na \w+, 5 Oct zostanie pominięta\.<\/p>$/],
  },
  {
    name: 'arithmetic and simple conditionals are interpolated',
    src: `export default function C({ a, b, ok }) {
  return <p>Total {a + b} items, {ok ? 1 : 2} left, {Math.round(a / 3)} rounded, by {a}.</p>;
}`,
    props: { a: 7, b: 5, ok: false },
    pl: { customer: { 'Total {{value}} items, {{value2}} left, {{value3}} rounded, by {{a}}.': 'Razem {{value}} pozycji, zostało {{value2}}, {{value3}} po zaokrągleniu, od {{a}}.' } },
    expectPl: [],
  },
  {
    name: 'identifiers that usually hold JSX are never interpolated into text',
    src: `export default function C({ badge, icon }) {
  return <p>Status: {badge} and {icon} shown here</p>;
}`,
    props: { badge: React.createElement('b', null, 'OK'), icon: React.createElement('i', null, '*') },
    pl: {},
    expectPl: [],
  },
  {
    name: '"by {{name}}" style labels keep their placeholder',
    src: `export default function C({ vendorName }) {
  return <p>by {vendorName}</p>;
}`,
    props: { vendorName: 'Anna' },
    pl: { customer: { 'by {{vendorName}}': 'od {{vendorName}}' } },
    expectPl: [/<p>od Anna<\/p>/],
  },
  {
    name: 'whitespace between inline elements survives',
    src: `export default function C({ price }) {
  return <p><b>Total:</b> {price} zł, paid <i>today</i> only</p>;
}`,
    props: { price: 12 },
    pl: {},
    expectPl: [],
  },
  {
    name: 'icon-font ligature text is never translated',
    src: `export default function C() {
  return <button><span className="material-symbols-outlined">cancel</span> Cancel</button>;
}`,
    props: {},
    pl: { customer: { Cancel: 'Anuluj', cancel: 'SHOULD-NOT-APPEAR' } },
    expectPl: [/>cancel<\/span> Anuluj<\/button>/],
  },
  {
    name: 'conditional leaves and && / || fallbacks',
    src: `export default function C({ ok, note, tab }) {
  return <div>{ok && 'Saved'}<span>{note || 'No notes'}</span><em>{tab === 'a' ? 'Orders' : 'Menu'}</em></div>;
}`,
    props: { ok: true, note: '', tab: 'b' },
    pl: { customer: { Saved: 'Zapisano', 'No notes': 'Brak notatek', Menu: 'Menu PL' } },
    expectPl: [/Zapisano/, /Brak notatek/, /Menu PL/],
  },
  {
    name: 'entities and unusual whitespace',
    src: `export default function C() {
  return <p>Fish&nbsp;&amp;&nbsp;Chips <span>   spaced   out   </span></p>;
}`,
    props: {},
    pl: {},
    expectPl: [],
  },
  {
    name: 'nested callbacks (map) use the component hook',
    src: `export default function C({ rows }) {
  return <ul>{rows.map((r) => <li key={r.id}>{r.name} is ready</li>)}</ul>;
}`,
    props: { rows: [{ id: 1, name: 'Soup' }, { id: 2, name: 'Salad' }] },
    pl: { customer: { '{{name}} is ready': '{{name}} jest gotowe' } },
    expectPl: [/Soup jest gotowe/, /Salad jest gotowe/],
  },
  {
    name: 'arrow component with expression body',
    src: `const C = ({ n }) => <section><h2>Order history</h2><p>Items: {n}</p></section>;
export default C;`,
    props: { n: 4 },
    pl: { customer: { 'Order history': 'Historia zamówień', 'Items: {{n}}': 'Pozycje: {{n}}' } },
    expectPl: [/Historia zamówień/, /Pozycje: 4/],
  },
];

for (const c of cases) {
  test(`renders identically in English: ${c.name}`, async () => {
    const res = processSource(c.src, { ns: 'customer', importPathToI18n: './unused' });
    assert.ok(res.code, 'the codemod changed something');
    const Original = await load(c.src);
    const Transformed = await load(res.code);
    const before = html(Original, c.props);
    const after = html(Transformed, c.props, await makeI18n('en'));
    assert.equal(after, before);
  });

  if (c.expectPl.length) {
    test(`applies translations: ${c.name}`, async () => {
      const res = processSource(c.src, { ns: 'customer', importPathToI18n: './unused' });
      const Transformed = await load(res.code);
      const out = html(Transformed, c.props, await makeI18n('pl', { pl: c.pl }));
      for (const re of c.expectPl) assert.match(out, re);
    });
  }
}

test('an untranslated language shows the English text, never a key placeholder', async () => {
  const src = cases[2].src;
  const Transformed = await load(processSource(src, { ns: 'customer' }).code);
  const out = html(Transformed, cases[2].props, await makeI18n('de', { de: { customer: {} } }));
  assert.equal(out, html(await load(src), cases[2].props));
});

test('a translation that drops a tag still renders without crashing', async () => {
  const c = cases[2];
  const Transformed = await load(processSource(c.src, { ns: 'customer' }).code);
  const inst = await makeI18n('pl', { pl: { customer: { 'Your <0>{{plan}}</0> plan starts on <1>{{date}}</1>.': 'Plan {{plan}} startuje {{date}}.' } } });
  assert.match(html(Transformed, c.props, inst), /Plan Weekly startuje 1 Oct\./);
});
