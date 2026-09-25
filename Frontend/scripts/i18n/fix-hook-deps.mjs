/**
 * A memoised callback that calls t() keeps the language it was created in unless t is one of its dependencies.
 * This adds `t` to the dependency array of useCallback/useMemo calls that use it.
 *
 * useEffect is deliberately left alone: adding t there would re-run data fetches every time the language changes,
 * and effects only use t for one-shot error messages.
 *
 *   node scripts/i18n/fix-hook-deps.mjs          list what would change
 *   node scripts/i18n/fix-hook-deps.mjs --write  apply
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { listTargets } from './codemod.mjs';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverse = (require('@babel/traverse').default || require('@babel/traverse'));
const MagicString = require('magic-string');

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MEMO_HOOKS = new Set(['useCallback', 'useMemo']);

/** [{ hook, line, name, insertAt, text }] for memoised hooks that use a translation function they do not list. */
export function findMissingDeps(code, file = 'x.jsx') {
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', ...(/\.tsx?$/.test(file) ? ['typescript'] : []), 'optionalChaining', 'classProperties', 'dynamicImport', 'topLevelAwait'] });
  } catch {
    return [];
  }
  const found = [];
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      const hook = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' ? c.property.name : null;
      if (!MEMO_HOOKS.has(hook)) return;
      const [fn, deps] = p.node.arguments;
      if (!fn || !/Function/.test(fn.type) || deps?.type !== 'ArrayExpression') return;
      const used = new Set();
      p.get('arguments.0').traverse({
        CallExpression(q) {
          const cc = q.node.callee;
          if (cc.type !== 'Identifier') return;
          const b = q.scope.getBinding(cc.name);
          if (b?.path.isVariableDeclarator() && b.path.node.init?.callee?.name === 'useTranslation') used.add(cc.name);
        },
        JSXOpeningElement(q) {
          const tAttr = q.node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 't');
          if (q.node.name.name === 'Trans' && tAttr?.value?.expression?.type === 'Identifier') used.add(tAttr.value.expression.name);
        },
      });
      const missing = [...used].filter((n) => !deps.elements.some((e) => e?.type === 'Identifier' && e.name === n));
      if (!missing.length) return;
      const last = deps.elements[deps.elements.length - 1];
      found.push({
        hook,
        line: p.node.loc.start.line,
        names: missing,
        insertAt: last ? last.end : deps.start + 1,
        text: `${last ? ', ' : ''}${missing.join(', ')}`,
      });
    },
  });
  return found;
}

if (process.argv[1]?.endsWith('fix-hook-deps.mjs')) {
  const write = process.argv.includes('--write');
  let total = 0;
  for (const { file } of listTargets(null)) {
    const code = fs.readFileSync(file, 'utf8');
    if (!/useTranslation/.test(code)) continue;
    const found = findMissingDeps(code, file);
    if (!found.length) continue;
    total += found.length;
    const rel = path.relative(FRONTEND, file).split(path.sep).join('/');
    found.forEach((f) => console.log(`${rel}:${f.line} ${f.hook} -> add ${f.names.join(', ')}`));
    if (write) {
      const s = new MagicString(code);
      found.forEach((f) => s.appendLeft(f.insertAt, f.text));
      fs.writeFileSync(file, s.toString());
    }
  }
  console.log(`${write ? 'fixed' : 'found'} ${total} memoised hooks`);
}
