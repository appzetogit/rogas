/**
 * Builds the translation catalog from the source code (the code is the single source of truth).
 *
 *   node scripts/i18n/extract-catalog.mjs            write Backend/src/modules/i18n/seed/catalog.json
 *   node scripts/i18n/extract-catalog.mjs --check    exit 1 if the committed catalog is out of date (for CI)
 *
 * Reads: t("..."), tr("..."), i18n.t("..."), tKey("...") and <Trans i18nKey="..." /> in the frontend,
 *        and msg("...") / translate(..., "...") style notification strings in the backend.
 * A string used by more than one app is stored once, in `common`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { listTargets } from './codemod.mjs';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverse = (require('@babel/traverse').default || require('@babel/traverse'));

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(FRONTEND, 'src');
const BACKEND = path.resolve(FRONTEND, '..', 'Backend');
const CATALOG_FILE = path.join(BACKEND, 'src', 'modules', 'i18n', 'seed', 'catalog.json');
const NAMESPACES = ['common', 'customer', 'vendor', 'driver', 'office', 'notifications'];

const toPosix = (p) => p.split(path.sep).join('/');

/** Extra folders that are not codemod targets but use t() (the language switcher itself). */
const EXTRA_DIRS = [{ dir: 'shared/i18n', ns: 'common' }];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') yield* walk(f); }
    else if (/\.(jsx?|tsx?)$/.test(e.name)) yield f;
  }
}

/** Keys used in one frontend file: [{ key, ns }] plus problems (non-literal keys). */
export function keysInSource(code, { file = 'x.jsx', defaultNs = 'common' } = {}) {
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', ...(/\.tsx?$/.test(file) ? ['typescript'] : []), 'optionalChaining', 'classProperties', 'dynamicImport', 'topLevelAwait'] });
  } catch (e) {
    return { keys: [], problems: [`parse error: ${e.message}`] };
  }
  const keys = [];
  const problems = [];

  const nsOfBinding = (path, name) => {
    const b = path.scope.getBinding(name);
    const decl = b?.path;
    if (decl?.isVariableDeclarator() && decl.node.init?.type === 'CallExpression' && decl.node.init.callee.name === 'useTranslation') {
      const a = decl.node.init.arguments[0];
      if (a?.type === 'StringLiteral') return a.value;
      if (a?.type === 'ArrayExpression' && a.elements[0]?.type === 'StringLiteral') return a.elements[0].value;
      return 'common';
    }
    return null;
  };
  const literal = (n) => (n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && n.expressions.length === 0 ? n.quasis[0].value.cooked : null);
  const at = (n) => `${file}:${n.loc?.start.line}`;

  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      const first = p.node.arguments[0];
      let ns = null;
      if (c.type === 'Identifier' && c.name === 'tKey') ns = defaultNs;
      else if (c.type === 'Identifier') ns = nsOfBinding(p, c.name);
      else if (c.type === 'MemberExpression' && c.object.name === 'i18n' && c.property.name === 't') {
        const opts = p.node.arguments[1];
        const nsProp = opts?.type === 'ObjectExpression' ? opts.properties.find((x) => x.key?.name === 'ns') : null;
        ns = nsProp?.value?.type === 'StringLiteral' ? nsProp.value.value : defaultNs;
      }
      if (ns === null) return;
      const key = literal(first);
      if (key === null) {
        // t(variable): fine when the variable holds a tKey()-marked string, so only report, do not fail.
        problems.push(`dynamic key at ${at(p.node)}`);
        return;
      }
      keys.push({ key, ns });
    },
    JSXOpeningElement(p) {
      if (p.node.name.name !== 'Trans') return;
      const attr = (n) => p.node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === n);
      const k = attr('i18nKey');
      const kn = k?.value?.type === 'JSXExpressionContainer' ? k.value.expression : k?.value;
      const key = literal(kn);
      if (key === null) { problems.push(`dynamic <Trans> key at ${at(p.node)}`); return; }
      let ns = defaultNs;
      const tAttr = attr('t');
      if (tAttr?.value?.type === 'JSXExpressionContainer' && tAttr.value.expression.type === 'Identifier') ns = nsOfBinding(p, tAttr.value.expression.name) || defaultNs;
      const nsAttr = attr('ns');
      if (nsAttr?.value?.type === 'StringLiteral') ns = nsAttr.value.value;
      keys.push({ key, ns });
    },
  });
  return { keys, problems };
}

/** Backend push notification strings: msg("...") descriptors and plain titles registered via notify("..."). */
export function keysInBackend() {
  const out = [];
  const problems = [];
  const root = path.join(BACKEND, 'src');
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') stack.push(f); continue; }
      if (!/\.js$/.test(e.name) || /modules[\\/]i18n[\\/]/.test(f)) continue;
      const code = fs.readFileSync(f, 'utf8');
      if (!/\bmsg\(|\bpushText\(/.test(code)) continue;
      let ast;
      try { ast = parse(code, { sourceType: 'module', plugins: ['optionalChaining', 'dynamicImport', 'topLevelAwait'] }); } catch { continue; }
      traverse(ast, {
        CallExpression(p) {
          const c = p.node.callee;
          if (c.type !== 'Identifier' || !['msg', 'pushText'].includes(c.name)) return;
          const a = p.node.arguments[0];
          const key = a?.type === 'StringLiteral' ? a.value : a?.type === 'TemplateLiteral' && a.expressions.length === 0 ? a.quasis[0].value.cooked : null;
          if (key === null) problems.push(`non-literal ${c.name}() at ${toPosix(path.relative(BACKEND, f))}:${p.node.loc.start.line}`);
          else out.push({ key, ns: 'notifications' });
        },
      });
    }
  }
  return { keys: out, problems };
}

export function buildCatalog() {
  const uses = new Map(); // key -> Set(ns)
  const problems = [];
  const add = (k) => { if (!uses.has(k.key)) uses.set(k.key, new Set()); uses.get(k.key).add(k.ns); };

  const files = [
    ...listTargets(null).map((t) => ({ file: t.file, ns: t.ns })),
    ...EXTRA_DIRS.flatMap((d) => [...walk(path.join(SRC, d.dir))].map((file) => ({ file, ns: d.ns }))),
  ];
  for (const { file, ns } of files) {
    const r = keysInSource(fs.readFileSync(file, 'utf8'), { file: toPosix(path.relative(FRONTEND, file)), defaultNs: ns });
    r.keys.forEach(add);
    problems.push(...r.problems);
  }
  const be = keysInBackend();
  be.keys.forEach(add);
  problems.push(...be.problems.filter((p) => p.startsWith('non-literal')));

  const catalog = Object.fromEntries(NAMESPACES.map((n) => [n, []]));
  for (const [key, nsSet] of uses) {
    const frontend = [...nsSet].filter((n) => n !== 'notifications');
    if (nsSet.has('notifications') && frontend.length === 0) catalog.notifications.push(key);
    else if (nsSet.has('notifications')) { catalog.notifications.push(key); catalog.common.push(key); }
    else catalog[frontend.length > 1 || frontend.includes('common') ? 'common' : frontend[0]].push(key);
  }
  for (const n of NAMESPACES) catalog[n] = [...new Set(catalog[n])].sort((a, b) => a.localeCompare(b));
  return { catalog, problems, keyCount: uses.size };
}

if (process.argv[1]?.endsWith('extract-catalog.mjs')) {
  const { catalog, problems, keyCount } = buildCatalog();
  const text = `${JSON.stringify(catalog, null, 1)}\n`;
  const counts = Object.fromEntries(NAMESPACES.map((n) => [n, catalog[n].length]));
  console.log('unique strings', keyCount, JSON.stringify(counts));
  if (problems.length) console.log(`dynamic keys (need a tKey() marker if they hold literals): ${problems.length}`);
  if (process.argv.includes('--problems')) problems.forEach((p) => console.log('  ', p));
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(CATALOG_FILE) ? fs.readFileSync(CATALOG_FILE, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') !== text) {
      console.error('catalog.json is out of date: run `node scripts/i18n/extract-catalog.mjs`');
      process.exit(1);
    }
    console.log('catalog.json is up to date');
  } else {
    fs.writeFileSync(CATALOG_FILE, text);
    console.log(`wrote ${toPosix(path.relative(FRONTEND, CATALOG_FILE))}`);
  }
}
