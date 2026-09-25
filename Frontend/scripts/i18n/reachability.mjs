/**
 * Import-graph reachability: which source files are actually loaded by each panel?
 * Used to skip dead legacy screens when extracting strings and to find shared UI in modules/Food.
 *
 *   node scripts/i18n/reachability.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverse = (require('@babel/traverse').default || require('@babel/traverse'));

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(FRONTEND, 'src');
const EXT = ['.jsx', '.js', '.tsx', '.ts', '/index.jsx', '/index.js', '/index.tsx', '/index.ts'];

const ALIASES = [
  ['@food/api/axios', path.join(SRC, 'services/api/axios.js')],
  ['@food/api/config', path.join(SRC, 'services/api/config.js')],
  ['@food/api', path.join(SRC, 'services/api')],
  ['@food', path.join(SRC, 'modules/Food')],
  ['@delivery', path.join(SRC, 'modules/DeliveryV2')],
  ['@', SRC],
];

const tryFile = (base) => {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const e of EXT) if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
  return null;
};

export const resolveImport = (spec, from) => {
  if (spec.startsWith('.')) return tryFile(path.resolve(path.dirname(from), spec));
  for (const [alias, target] of ALIASES) {
    if (spec === alias) return tryFile(target);
    if (spec.startsWith(`${alias}/`)) return tryFile(path.join(target, spec.slice(alias.length + 1)));
  }
  return null;
};

const importsOf = (file) => {
  let ast;
  try {
    ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx', 'typescript', 'optionalChaining', 'dynamicImport'], errorRecovery: true });
  } catch {
    return [];
  }
  const specs = [];
  traverse(ast, {
    ImportDeclaration(p) { specs.push(p.node.source.value); },
    ExportAllDeclaration(p) { specs.push(p.node.source.value); },
    ExportNamedDeclaration(p) { if (p.node.source) specs.push(p.node.source.value); },
    CallExpression(p) {
      if (p.node.callee.type === 'Import' && p.node.arguments[0]?.type === 'StringLiteral') specs.push(p.node.arguments[0].value);
    },
  });
  return specs;
};

export const reach = (roots) => {
  const seen = new Set();
  const queue = roots.filter(fs.existsSync);
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of importsOf(f)) {
      const r = resolveImport(spec, f);
      if (r && /\.(jsx?|tsx?)$/.test(r) && !seen.has(r)) queue.push(r);
    }
  }
  return seen;
};

export const PANEL_ROOTS = {
  customer: ['modules/CustomerApp/routes.jsx'],
  vendor: ['modules/Vendor/routes.jsx'],
  driver: ['modules/DeliveryV2/index.jsx'],
  office: ['modules/Office/routes.jsx'],
  auth: ['modules/auth/routes.jsx'],
};

export const reachableByPanel = () =>
  Object.fromEntries(Object.entries(PANEL_ROOTS).map(([panel, roots]) => [panel, reach(roots.map((r) => path.join(SRC, r)))]));

const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');

if (process.argv[1]?.endsWith('reachability.mjs')) {
  const byPanel = reachableByPanel();
  for (const [panel, files] of Object.entries(byPanel)) {
    const inFood = [...files].filter((f) => rel(f).startsWith('modules/Food/'));
    const foodNonAdmin = inFood.filter((f) => !/modules\/Food\/(pages|components)\/admin\//.test(rel(f)));
    const foodAdmin = inFood.length - foodNonAdmin.length;
    console.log(`${panel.padEnd(9)} total ${String(files.size).padStart(4)} | in Food: ${inFood.length} (admin ${foodAdmin}, non-admin ${foodNonAdmin.length})`);
  }
  const dir = (name) => {
    const all = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const f = path.join(d, e.name); e.isDirectory() ? walk(f) : /\.(jsx?|tsx?)$/.test(e.name) && all.push(f); });
    walk(path.join(SRC, 'modules', name));
    return all;
  };
  for (const [name, panel] of [['CustomerApp', 'customer'], ['Vendor', 'vendor'], ['DeliveryV2', 'driver'], ['Office', 'office']]) {
    const all = dir(name);
    const live = all.filter((f) => byPanel[panel].has(f));
    const dead = all.filter((f) => !byPanel[panel].has(f) && !Object.values(byPanel).some((s) => s.has(f)));
    console.log(`\n${name}: ${all.length} files, ${live.length} reachable, ${dead.length} unreachable from any panel`);
    if (process.argv.includes('--list-dead')) dead.forEach((f) => console.log('   dead:', rel(f)));
  }
}
