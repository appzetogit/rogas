import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { processSource } from './codemod.mjs';
import { findMissingDeps } from './fix-hook-deps.mjs';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');

const run = (code, ns = 'customer') => {
  const res = processSource(code, { ns, importPathToI18n: '../../shared/i18n' });
  if (res.code) parse(res.code, { sourceType: 'module', plugins: ['jsx'] }); // output must always be valid
  return res;
};
const keysOf = (res) => res.keys.map((k) => k.key);

test('arrow component with expression body gets a block body and a hook', () => {
  const res = run(`import React from "react";\nexport const Card = () => (\n  <div>\n    <h1>Delivery Time Slots</h1>\n  </div>\n);\n`);
  assert.deepEqual(keysOf(res), ['Delivery Time Slots']);
  assert.match(res.code, /const \{ t \} = useTranslation\("customer"\);/);
  assert.match(res.code, /return \(\s*<div>/);
  assert.match(res.code, /<h1>\{t\("Delivery Time Slots"\)\}<\/h1>/);
  assert.match(res.code, /import \{ useTranslation \} from "react-i18next";/);
});

test('block-body component: hook is the first statement', () => {
  const res = run(`function Plans() {\n  const [a, setA] = useState(0);\n  return <p>Choose a plan</p>;\n}\n`);
  assert.match(res.code, /function Plans\(\) \{\n  const \{ t \} = useTranslation\("customer"\);\n  const \[a, setA\]/);
});

test('text mixed with expressions becomes one interpolated key', () => {
  const res = run(`const A = ({ name, user, n }) => <p>Hello, {name}! You have {user.count} meals and {n.toFixed(2)} left.</p>;`);
  assert.deepEqual(keysOf(res), ['Hello, {{name}}! You have {{count}} meals and {{n}} left.']);
  assert.match(res.code, /t\("Hello, \{\{name\}\}! You have \{\{count\}\} meals and \{\{n\}\} left\.", \{ name, count: user\.count, n: n\.toFixed\(2\) \}\)/);
});

test('multi-line JSX text follows React whitespace rules', () => {
  const res = run(`const A = () => (\n  <p>\n    First line\n    second line\n  </p>\n);`);
  assert.deepEqual(keysOf(res), ['First line second line']);
});

test('a sentence with inline tags becomes one <Trans> unit with numbered tags', () => {
  const res = run(`const A = ({ price }) => <p><b>Total:</b> {price} zł, paid <i>today</i> only</p>;`);
  assert.deepEqual(keysOf(res), ['<0>Total:</0> {{price}} zł, paid <1>today</1> only']);
  assert.match(res.code, /<Trans t=\{t\} i18nKey=/);
  assert.match(res.code, /import \{ Trans, useTranslation \} from "react-i18next";/);
  assert.match(res.code, /components=\{\[<b \/>, <i \/>\]\}/);
});

test('whitespace around a plain text run is left exactly as written', () => {
  const res = run(`const A = ({ n }) => <p><img src="x" /> Hello {n} there <img src="y" /></p>;`);
  assert.deepEqual(keysOf(res), ['Hello {{n}} there']);
  assert.match(res.code, /<img src="x" \/> \{t\("Hello/);
});

test('text attributes are translated, class/type/href are not', () => {
  const res = run(`const A = ({ x }) => <input className="border rounded" type="text" href="/orders" placeholder="Search meals" title={x ? "Open" : "Closed"} />;`);
  assert.deepEqual(keysOf(res).sort(), ['Closed', 'Open', 'Search meals']);
  assert.match(res.code, /placeholder=\{t\("Search meals"\)\}/);
  assert.match(res.code, /className="border rounded"/);
  assert.match(res.code, /title=\{x \? t\("Open"\) : t\("Closed"\)\}/);
});

test('string leaves in JSX ternaries and && are translated', () => {
  const res = run(`const A = ({ loading, ok }) => <div>{loading ? 'Sending...' : 'Send'}{ok && 'Saved'}</div>;`);
  assert.deepEqual(keysOf(res).sort(), ['Saved', 'Send', 'Sending...']);
});

test('toast / alert / error-setter arguments are translated', () => {
  const res = run(`const A = ({ name }) => {\n  const go = async () => {\n    toast.error("Failed to save");\n    toast.success(\`Saved \${name}\`);\n    showToast('Meal added');\n    setError(err.message || "Something went wrong");\n    console.log("debug text here");\n  };\n  return <button onClick={go}>Go</button>;\n};`);
  assert.deepEqual(keysOf(res).sort(), ['Failed to save', 'Go', 'Meal added', 'Saved {{name}}', 'Something went wrong']);
  assert.match(res.code, /toast\.success\(t\("Saved \{\{name\}\}", \{ name \}\)\)/);
  assert.match(res.code, /setError\(err\.message \|\| t\("Something went wrong"\)\)/);
  assert.match(res.code, /console\.log\("debug text here"\)/, 'logs are untouched');
});

test('plain (non-component) functions use i18n.t and import it', () => {
  const res = run(`export function notify() {\n  toast.error("Could not connect");\n}\n`);
  assert.match(res.code, /i18n\.t\("Could not connect"\)/);
  assert.match(res.code, /import i18n from "\.\.\/\.\.\/shared\/i18n";/);
  assert.ok(!/useTranslation/.test(res.code));
});

test('a capitalised helper without JSX is treated as a plain function', () => {
  const res = run(`export function ParseError(e) {\n  return toast.error("Bad input");\n}\n`);
  assert.match(res.code, /i18n\.t\("Bad input"\)/);
  assert.ok(!/useTranslation/.test(res.code));
});

test('an existing binding named t forces a different alias, without breaking it', () => {
  const res = run(`const A = ({ items }) => <ul>{items.map(t => <li key={t.id}>{t.name}</li>)}<li>Nothing else</li></ul>;`);
  assert.equal(res.alias, 'tr');
  assert.match(res.code, /const \{ t: tr \} = useTranslation\("customer"\);/);
  assert.match(res.code, /\{tr\("Nothing else"\)\}/);
  assert.match(res.code, /items\.map\(t => /, 'the user\'s own t is untouched');
});

test('an existing useTranslation binding is reused, not duplicated', () => {
  const res = run(`import { useTranslation } from "react-i18next";\nconst A = () => {\n  const { t } = useTranslation("common");\n  return <p>{t("Save")} <span>Cancel</span></p>;\n};`);
  assert.equal((res.code.match(/useTranslation\(/g) || []).length, 1);
  assert.match(res.code, /<span>\{t\("Cancel"\)\}<\/span>/);
});

test('nested callbacks use the enclosing component hook', () => {
  const res = run(`function List({ rows }) {\n  return <ul>{rows.map((r) => <li key={r.id}>{r.name} is ready</li>)}</ul>;\n}\n`);
  assert.deepEqual(keysOf(res), ['{{name}} is ready']);
  assert.equal((res.code.match(/useTranslation\(/g) || []).length, 1);
});

test('memo/forwardRef components get the hook', () => {
  const res = run(`const A = React.memo(function A() { return <p>Memoised text</p>; });\nconst B = forwardRef((p, ref) => <p ref={ref}>Forwarded text</p>);`);
  assert.equal((res.code.match(/const \{ t \} = useTranslation/g) || []).length, 2);
});

test('config arrays inside components are translated; module-level ones are marked with tKey()', () => {
  const res = run(`const STATUS = [{ label: 'Scheduled', id: 'a' }];
const A = () => {
  const tabs = [{ label: 'Home', key: 'h' }, { label: 'Orders', key: 'o' }];
  return <nav>{tabs.map((x) => <a key={x.key}>{x.label}</a>)}</nav>;
};`);
  assert.deepEqual(keysOf(res).sort(), ['Home', 'Orders', 'Scheduled']);
  assert.match(res.code, /label: tKey\("Scheduled"\)/, 'module constant is marked, not translated');
  assert.match(res.code, /import \{ tKey \} from/);
  assert.match(res.code, /label: t\("Home"\)/, 'in-component config is translated directly');
});

test('API payload objects are never translated', () => {
  const res = run(`const A = () => {\n  const save = () => api.post('/x', { title: 'Weekly Plan', description: 'Hello there' });\n  return <button onClick={save}>Save</button>;\n};`);
  assert.deepEqual(keysOf(res), ['Save']);
  assert.match(res.code, /title: 'Weekly Plan'/);
});

test('numbers, symbols, urls and style/code blocks are skipped', () => {
  const res = run(`const A = () => <div><span>123</span><span>₹ / -</span><style>{".a{color:red}"}</style><code>npm install</code><a href="https://x.com">Docs</a></div>;`);
  assert.deepEqual(keysOf(res), ['Docs']);
});

test('HTML entities are decoded in the key; unknown entities are skipped and reported', () => {
  const ok = run(`const A = () => <p>Fish&nbsp;&amp;&nbsp;Chips</p>;`);
  assert.deepEqual(keysOf(ok), ['Fish & Chips']);
  const bad = run(`const A = () => <p>Weird &foo; text</p>;`);
  assert.deepEqual(keysOf(bad), []);
  assert.ok(bad.report.some((r) => r.kind === 'entity'));
});

test('idempotent: a second pass finds nothing left to translate', () => {
  const first = run(`const A = ({ n }) => <div><p>Hello {n}</p><input placeholder="Search" />{n ? 'Yes' : 'No'}</div>;`);
  const second = run(first.code);
  assert.equal(second.edits, 0);
});

test('files with no translatable text are returned untouched', () => {
  const res = run(`const A = () => <div className="x">{1 + 2}</div>;`);
  assert.equal(res.edits, 0);
  assert.equal(res.code, undefined);
});

test('parse errors are reported, not thrown', () => {
  const res = processSource('const = ;', { ns: 'customer' });
  assert.match(res.skipped, /parse error/);
});

test('the generated hook call matches what the extractor reads back', () => {
  const res = run(`const A = () => <h2>Order history</h2>;`, 'vendor');
  assert.match(res.code, /useTranslation\("vendor"\)/);
});

test('English plural suffixes are reported and left alone instead of producing broken translations', () => {
  const res = run(`const A = ({ d }) => <span>{d} Day{d > 1 ? 's' : ''} left, keep going</span>;`);
  assert.ok(res.report.some((r) => r.kind === 'plural-suffix'));
  assert.ok(!keysOf(res).some((k) => /Day/.test(k)), 'the pluralised run is not translated');
});

test('single-letter fallbacks, "3x" quantities and connector words are not translated', () => {
  const res = run(`const A = ({ name, q, t2 }) => <div><i>{name?.[0] || 'U'}</i><b>{q}x</b><em>and</em><p>Real text here</p></div>;`);
  assert.deepEqual(keysOf(res), ['Real text here']);
  assert.ok(res.report.some((r) => r.kind === 'fragment' && r.text === 'and'));
});

test('memoised callbacks that use t() must list it; effects are deliberately exempt', () => {
  const src = `import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo } from "react";
const A = () => {
  const { t } = useTranslation("x");
  const a = useCallback(() => toast(t("Saved")), []);
  const b = useCallback(() => toast(t("Saved")), [t]);
  const c = useMemo(() => [t("One")], [1]);
  useEffect(() => { toast(t("Loaded")); }, []);
  return null;
};`;
  const found = findMissingDeps(src);
  assert.deepEqual(found.map((f) => f.hook), ['useCallback', 'useMemo']);
  assert.equal(found[0].text, 't');
  assert.equal(found[1].text, ', t');
});

test('validation messages, message variables and label helpers are translated; compared values are not', () => {
  const res = run(`const A = ({ status }) => {
  const [errors, setErrors] = useState({});
  const validate = () => {
    const newErrors = {};
    newErrors.name = "Name is required";
    errors.email = "Email is required";
    setErrors(newErrors);
  };
  const errMsg = err.message || "Failed to save";
  setFormError("Please describe your issue.");
  const getStatusLabel = (s) => { if (s === "active") return "Active"; return "Unknown state"; };
  const kind = status === "Pending Payment" ? "Pending Payment" : "Other kind";
  const label = status === "Done" ? "Done" : "Not done";
  return <p>{getStatusLabel(status)}</p>;
};`);
  const keys = keysOf(res).sort();
  assert.ok(keys.includes('Name is required'));
  assert.ok(keys.includes('Email is required'));
  assert.ok(keys.includes('Failed to save'));
  assert.ok(keys.includes('Please describe your issue.'));
  assert.ok(keys.includes('Active'));
  assert.ok(keys.includes('Unknown state'));
  assert.ok(keys.includes('Not done'));
  assert.ok(!keys.includes('Done'), '"Done" is compared with === so it is data');
  assert.ok(res.report.some((r) => r.kind === 'compared' && r.text === 'Done'));
  assert.match(res.code, /const \{ t \} = useTranslation/);
});

test('optional-call toasts (onShowToast?.("...")) are translated too', () => {
  const res = run(`const A = ({ onShowToast }) => {
  const go = () => { onShowToast?.("Order skipped"); onShowToast?.(err.message || "Failed to skip order"); };
  return <button onClick={go}>Go</button>;
};`);
  assert.deepEqual(keysOf(res).sort(), ['Failed to skip order', 'Go', 'Order skipped']);
});

test('an English plural glued into a template literal is reported, not turned into a placeholder', () => {
  const res = run("const A = ({ n }) => { toast.success(`Added ${n} item${n !== 1 ? 's' : ''}`); return <p>x</p>; };");
  assert.ok(res.report.some((r) => r.kind === 'plural-suffix'));
  assert.ok(!keysOf(res).some((k) => /item/.test(k)));
});
