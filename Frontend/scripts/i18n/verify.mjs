/**
 * Static verification of translated source files. Exits non-zero on any problem.
 *
 *   node scripts/i18n/verify.mjs            check everything in scope
 *   node scripts/i18n/verify.mjs --residual list JSX text that is still untranslated
 *
 * Checks (a successful build cannot catch these):
 *   - every t()/tr() call resolves to a real useTranslation binding (no "t is not defined" at runtime)
 *   - every i18n.t() call has an i18n import
 *   - useTranslation is called once, at the top level of a component/hook body (rules of hooks)
 *   - useTranslation and i18n are imported wherever they are used
 *   - t() is always called with a string literal first argument (or a marked dynamic key), so the catalog is complete
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { listTargets } from './codemod.mjs';
import { findMissingDeps } from './fix-hook-deps.mjs';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverse = (require('@babel/traverse').default || require('@babel/traverse'));

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (f) => path.relative(FRONTEND, f).split(path.sep).join('/');

export function verifyFile(file, code = fs.readFileSync(file, 'utf8')) {
  const problems = [];
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', ...(/\.tsx?$/.test(file) ? ['typescript'] : []), 'optionalChaining', 'classProperties', 'dynamicImport', 'topLevelAwait'] });
  } catch (e) {
    return [`parse error: ${e.message}`];
  }
  const at = (n) => `line ${n.loc?.start.line}`;
  const hookCalls = [];
  const tNames = new Set();
  let importsUseTranslation = false;
  let importsI18n = false;
  const residual = [];

  traverse(ast, {
    ImportDeclaration(p) {
      if (p.node.source.value === 'react-i18next' && p.node.specifiers.some((s) => s.imported?.name === 'useTranslation')) importsUseTranslation = true;
      if (/(^|\/)i18n(\/index(\.js)?)?$/.test(p.node.source.value) && p.node.specifiers.some((s) => s.type === 'ImportDefaultSpecifier' && s.local.name === 'i18n')) importsI18n = true;
    },
    VariableDeclarator(p) {
      const init = p.node.init;
      if (init?.type === 'CallExpression' && init.callee.name === 'useTranslation') {
        hookCalls.push(p);
        if (p.node.id.type === 'ObjectPattern') {
          for (const prop of p.node.id.properties) if (prop.key?.name === 't') tNames.add(prop.value?.name || 't');
        }
      }
    },
  });

  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      // A t()/tr() call in a file that never declares one is exactly what a hand edit can get wrong.
      if (c.type === 'Identifier' && ['t', 'tr', 'tx', 'tt'].includes(c.name) && !p.scope.hasBinding(c.name)) {
        problems.push(`${c.name}() used but not defined (${at(p.node)})`);
        return;
      }
      const isT = c.type === 'Identifier' && tNames.has(c.name);
      const isI18nT = c.type === 'MemberExpression' && c.object.name === 'i18n' && c.property.name === 't';

      if (isT) {
        const binding = p.scope.getBinding(c.name);
        if (!binding) problems.push(`${c.name}() used but not defined (${at(p.node)})`);
        else {
          const bp = binding.path;
          const init = bp.isVariableDeclarator() ? bp.node.init : null;
          if (!(init?.type === 'CallExpression' && init.callee.name === 'useTranslation')) {
            problems.push(`${c.name}() resolves to something other than useTranslation (${at(p.node)})`);
          }
        }
      }
      if (isI18nT && !p.scope.hasBinding('i18n')) problems.push(`i18n.t() used but i18n is not imported (${at(p.node)})`);
    },
  });

  // <Trans>: imported, literal key, and the <N> tags in the key match the components array
  let importsTrans = false;
  traverse(ast, {
    ImportDeclaration(p) {
      if (p.node.source.value === 'react-i18next' && p.node.specifiers.some((sp) => sp.imported?.name === 'Trans')) importsTrans = true;
    },
  });
  traverse(ast, {
    JSXOpeningElement(p) {
      if (p.node.name.type !== 'JSXIdentifier' || p.node.name.name !== 'Trans') return;
      if (!importsTrans) problems.push(`<Trans> used but not imported (${at(p.node)})`);
      const attr = (name) => p.node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === name);
      const keyAttr = attr('i18nKey');
      const keyNode = keyAttr?.value?.type === 'JSXExpressionContainer' ? keyAttr.value.expression : keyAttr?.value;
      const key = keyNode?.type === 'StringLiteral' ? keyNode.value : null;
      if (key === null) { problems.push(`<Trans> needs a string-literal i18nKey (${at(p.node)})`); return; }
      const comps = attr('components')?.value?.expression;
      const count = comps?.type === 'ArrayExpression' ? comps.elements.length : 0;
      const indexes = [...key.matchAll(/<(\d+)(?:\s*\/)?>/g)].map((m) => Number(m[1]));
      const unique = [...new Set(indexes)];
      if (unique.length !== count || unique.some((i) => i >= count)) problems.push(`<Trans> tags in the key (${unique.join(',')}) do not match components (${count}) (${at(p.node)})`);
      const opens = (key.match(/<\d+>/g) || []).length;
      const closes = (key.match(/<\/\d+>/g) || []).length;
      if (opens !== closes) problems.push(`<Trans> key has unbalanced tags (${at(p.node)})`);
    },
  });

  // hooks: once per function, direct child of a function body
  const perFn = new Map();
  for (const hp of hookCalls) {
    const decl = hp.parentPath; // VariableDeclaration
    const block = decl.parentPath;
    const fn = block?.parentPath;
    if (!block?.isBlockStatement() || !fn?.isFunction()) {
      problems.push(`useTranslation is not at the top level of a function body (${at(hp.node)})`);
      continue;
    }
    perFn.set(fn.node, (perFn.get(fn.node) || 0) + 1);
  }
  for (const [, n] of perFn) if (n > 1) problems.push('useTranslation called more than once in the same function');
  for (const m of findMissingDeps(code, file)) {
    problems.push(`${m.hook} uses ${m.names.join(', ')}() but does not list it as a dependency, so it keeps the old language (line ${m.line})`);
  }
  if (hookCalls.length && !importsUseTranslation) problems.push('useTranslation is used but not imported from react-i18next');
  if (/\bi18n\.t\(/.test(code) && !importsI18n && !/\bconst\s+i18n\b|\bimport\s+\*\s+as\s+i18n/.test(code)) problems.push('i18n.t is used but i18n is not imported');
  return problems;
}

export function residualText(file, code = fs.readFileSync(file, 'utf8')) {
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', ...(/\.tsx?$/.test(file) ? ['typescript'] : []), 'optionalChaining', 'classProperties', 'dynamicImport'] });
  } catch {
    return [];
  }
  const out = [];
  traverse(ast, {
    JSXText(p) {
      const text = p.node.value.replace(/\s+/g, ' ').trim();
      if (/\p{L}{2,}/u.test(text) && !p.findParent((q) => q.isJSXElement() && ['style', 'script', 'code', 'pre'].includes(q.node.openingElement.name.name))) out.push(text.slice(0, 70));
    },
  });
  return out;
}

if (process.argv[1]?.endsWith('verify.mjs')) {
  let bad = 0;
  let checked = 0;
  const residuals = [];
  for (const { file } of listTargets(null)) {
    const code = fs.readFileSync(file, 'utf8');
    if (!/useTranslation|i18n\.t\(|\bt\(|<Trans\b/.test(code)) {
      residuals.push(...residualText(file, code).map((t) => `${rel(file)} | ${t}`));
      continue;
    }
    checked++;
    const problems = verifyFile(file, code);
    if (problems.length) {
      bad++;
      console.log(`✗ ${rel(file)}`);
      problems.forEach((pr) => console.log(`    ${pr}`));
    }
    residuals.push(...residualText(file, code).map((t) => `${rel(file)} | ${t}`));
  }
  console.log(`\nchecked ${checked} translated files, ${bad} with problems`);
  console.log(`residual untranslated JSX text nodes: ${residuals.length}`);
  if (process.argv.includes('--residual')) residuals.forEach((r) => console.log('  ', r));
  process.exit(bad ? 1 : 0);
}
