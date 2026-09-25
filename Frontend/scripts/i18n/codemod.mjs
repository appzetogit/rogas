/**
 * i18n codemod: wraps user-visible English strings in t("...") / <Trans> (English text is the key).
 *
 *   node scripts/i18n/codemod.mjs                 dry run over every file the panels load, prints a summary
 *   node scripts/i18n/codemod.mjs --write         apply the changes
 *   node scripts/i18n/codemod.mjs --files a.jsx   only these files (paths relative to Frontend/)
 *   node scripts/i18n/codemod.mjs --json out.json write the full report as JSON
 *
 * It edits source text in place (magic-string), so formatting, comments and JSX whitespace semantics survive.
 * Re-running is safe: strings already inside t() are no longer JSX text / toast arguments.
 *
 * What it translates
 *   - JSX text, including "Hello {name}" runs                           -> t("Hello {{name}}", { name })
 *   - sentences that contain inline tags ("Your <b>{plan}</b> starts")  -> <Trans i18nKey="Your <0>{{plan}}</0> starts" .../>
 *   - text attributes (placeholder, title, alt, aria-label, label ...)
 *   - string leaves of JSX ternaries / && / ||
 *   - first argument of toast / alert / confirm / set*Error style calls
 *   - label-like properties of config arrays declared inside components
 * What it leaves alone and reports: module-level constants, English plural suffixes ("Day{n>1?'s':''}"),
 * mid-sentence fragments, unknown HTML entities.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { reachableByPanel } from './reachability.mjs';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverse = (require('@babel/traverse').default || require('@babel/traverse'));
const MagicString = require('magic-string');

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(FRONTEND, 'src');
const I18N_MODULE = path.join(SRC, 'shared', 'i18n', 'index.js');

/** Folders that own a namespace. Shared UI under modules/Food is assigned by which panels actually load it. */
const OWNED = [
  { dir: 'modules/CustomerApp', ns: 'customer' },
  { dir: 'modules/Vendor', ns: 'vendor' },
  { dir: 'modules/DeliveryV2', ns: 'driver' },
  { dir: 'modules/Office', ns: 'office' },
  { dir: 'modules/auth', ns: 'common' },
  { dir: 'shared/components', ns: 'common' },
];
const NEVER = [/\/shared\/i18n\//, /mockData\.js$/, /\/modules\/Food\/(pages|components)\/admin\//, /\.d\.ts$/];
const PANEL_TO_NS = { customer: 'customer', vendor: 'vendor', driver: 'driver', office: 'office', auth: 'common' };

const TEXT_ATTRS = new Set([
  'placeholder', 'title', 'alt', 'aria-label', 'label', 'helperText', 'description', 'subtitle', 'heading',
  'message', 'text', 'buttonText', 'confirmText', 'cancelText', 'emptyText', 'tooltip', 'caption', 'header',
]);
const ALWAYS_TEXT_ATTRS = new Set(['placeholder', 'title', 'alt', 'aria-label']);
const CONFIG_PROPS = new Set(['label', 'title', 'text', 'description', 'subtitle', 'placeholder', 'heading', 'tooltip', 'caption', 'desc', 'errorMessage', 'hint', 'helperText']);
const MESSAGE_FNS = new Set([
  'showToast', 'triggerToast', 'triggerGlobalToast', 'onShowToast', 'onShowNotificationToast', 'setToast', 'setToastMessage',
  'setError', 'setErrorMessage', 'setErrorMsg', 'setMessage', 'setSuccess', 'setSuccessMessage', 'setStatusMessage', 'setAlert', 'alert', 'confirm',
]);
const TOAST_METHODS = new Set(['success', 'error', 'info', 'warning', 'message', 'loading', 'warn']);
const isMessageFn = (name) => MESSAGE_FNS.has(name)
  || /^set\w*(Error|Errors|Message|Msg|Toast|Alert|Warning|Success|Notice|Text)$/.test(name)
  || /^(show|trigger|push|add)(Toast|Error|Success|Alert|Notification|Message)$/.test(name)
  || ['setTitle', 'setHeading', 'setSubtitle'].includes(name);
/** Variables / properties that hold user-facing message text. */
const MESSAGE_VAR = /^(err|error|errMsg|errorMsg|errorMessage|errorText|errText|msg|message|successMsg|successMessage|statusText|statusLabel|label|title|heading|subtitle|caption|greeting|badge|badgeText|buttonLabel|buttonText|tooltip|hint|helperText)$/i;
/** Objects that collect validation errors: errors.name = "...", newErrors[field] = "...". */
const ERROR_OBJECT = /^(new|form|field|validation)?errors?$/i;
/** Functions whose return value is display text. */
const LABEL_FN = /(label|text|title|desc|message|badge|greeting|heading|caption|statusname)/i;
const SKIP_ELEMENTS = new Set(['style', 'script', 'code', 'pre']);
const INLINE_TAGS = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 'small', 'mark', 'a', 'sup', 'sub', 'abbr', 'br', 'label']);
const ICON_CLASS = /material-symbols|material-icons|\bicon\b|\bfa-|lucide|notranslate/i;
const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  hellip: '…', middot: '·', bull: '•', copy: '©', mdash: '—', ndash: '–', larr: '←', rarr: '→',
  uarr: '↑', darr: '↓', times: '×', check: '✓', euro: '€', laquo: '«', raquo: '»', trade: '™',
  reg: '®', deg: '°', plusmn: '±', hearts: '♥', star: '★',
};
const FRAGMENT_WORDS = new Set(['and', 'or', 'by', 'to', 'of', 'the', 'in', 'on', 'at', 'for', 'a', 'an', 'x', 's', 'es', 'with', 'from', 'per']);

const hasLetters = (s) => /\p{L}/u.test(String(s).replace(/\{\{[\w.]+\}\}/g, ''));
const quote = (s) => JSON.stringify(s);
const balanced = (s) => {
  let p = 0;
  let b = 0;
  for (const ch of s) {
    if (ch === '(') p++;
    else if (ch === ')') p--;
    else if (ch === '[') b++;
    else if (ch === ']') b--;
    if (p < 0 || b < 0) return false;
  }
  return p === 0 && b === 0;
};

/** React's JSX whitespace rule for one JSXText node. */
function cleanJsxText(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  lines.forEach((l, i) => { if (/[^ \t]/.test(l)) lastNonEmpty = i; });
  let out = '';
  lines.forEach((line, i) => {
    let t = line.replace(/\t/g, ' ');
    if (i !== 0) t = t.replace(/^ +/, '');
    if (i !== lines.length - 1) t = t.replace(/ +$/, '');
    if (t) {
      if (i !== lastNonEmpty) t += ' ';
      out += t;
    }
  });
  return out;
}

function decodeEntities(raw) {
  let ok = true;
  const out = raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    if (e in ENTITIES) return ENTITIES[e];
    ok = false;
    return m;
  });
  return ok && !/&[a-z#]/i.test(out.replace(/&\s/g, '')) ? out : null;
}

export function processSource(code, { ns, file = 'x.jsx', importPathToI18n = './shared/i18n' }) {
  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', ...(/\.tsx?$/.test(file) ? ['typescript'] : []), 'optionalChaining', 'classProperties', 'dynamicImport', 'topLevelAwait'],
      errorRecovery: false,
    });
  } catch (err) {
    return { skipped: `parse error: ${err.message}`, edits: 0, keys: [], report: [] };
  }

  const s = new MagicString(code);
  const report = [];
  const keys = [];
  const componentHooks = new Map();
  let usesI18nFallback = false;
  let usesTrans = false;
  let usesTKey = false;
  let edits = 0;

  // ── Which local name do we use for t? Avoid clashing with anything already bound. ──
  const boundNames = new Set();
  let existingT = null;
  traverse(ast, { Scope(p) { Object.keys(p.scope.bindings).forEach((n) => boundNames.add(n)); } });
  traverse(ast, {
    VariableDeclarator(p) {
      const init = p.node.init;
      if (init?.type === 'CallExpression' && init.callee.name === 'useTranslation' && p.node.id.type === 'ObjectPattern') {
        for (const prop of p.node.id.properties) if (prop.key?.name === 't') existingT = prop.value?.name || 't';
      }
    },
  });
  let T = existingT || 't';
  if (!existingT) for (const cand of ['t', 'tr', 'tx', 'tt']) { if (!boundNames.has(cand)) { T = cand; break; } }
  const hasFileI18nImport = /from\s+['"][^'"]*shared\/i18n(?:\/index(?:\.js)?)?['"]/.test(code) || boundNames.has('i18n');

  // ── function classification ─────────────────────────────────────────────────
  const isFn = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

  const fnNameOf = (fp) => {
    const n = fp.node;
    if (n.id?.name) return n.id.name;
    let p = fp.parentPath;
    if (p.isCallExpression() && ['memo', 'forwardRef'].includes(p.node.callee.name || p.node.callee.property?.name)) p = p.parentPath;
    if (p.isVariableDeclarator() && p.node.id.type === 'Identifier') return p.node.id.name;
    if (p.isAssignmentExpression() && p.node.left.type === 'Identifier') return p.node.left.name;
    if (p.isExportDefaultDeclaration()) return 'DefaultExport';
    return null;
  };
  const containsJsx = (fp) => {
    let found = false;
    fp.traverse({ JSXElement(q) { found = true; q.stop(); }, JSXFragment(q) { found = true; q.stop(); } });
    return found;
  };
  const compCache = new Map();
  const classify = (fp) => {
    if (compCache.has(fp.node)) return compCache.get(fp.node);
    const name = fnNameOf(fp);
    let kind = 'plain';
    if (name && /^[A-Z]/.test(name) && containsJsx(fp)) kind = 'component';
    else if (name && /^use[A-Z]/.test(name)) kind = 'hook';
    compCache.set(fp.node, kind);
    return kind;
  };
  const enclosingComponent = (path) => path.findParent((q) => isFn(q.node) && ['component', 'hook'].includes(classify(q)));

  /** Text to call for a translation from `path`: the hook's t, or the module-level i18n.t. */
  const useCallee = (path) => {
    const fp = enclosingComponent(path);
    if (!fp) {
      usesI18nFallback = true;
      return 'i18n.t';
    }
    if (existingT && path.scope.hasBinding(existingT)) return existingT;
    componentHooks.set(fp.node, fp);
    return T;
  };

  // ── helpers ─────────────────────────────────────────────────────────────────
  const varNameFor = (expr) => {
    let base = 'value';
    let e = expr;
    while (['LogicalExpression', 'BinaryExpression'].includes(e.type)) e = e.left;
    if (e.type === 'ConditionalExpression') e = e.consequent;
    if (e.type === 'CallExpression' || e.type === 'OptionalCallExpression') {
      if (e.callee.type === 'MemberExpression' && e.callee.object.type === 'Identifier' && e.callee.object.name === 'Math') return 'value';
      e = ['MemberExpression', 'OptionalMemberExpression'].includes(e.callee.type) ? e.callee.object : e.callee;
    }
    if (e.type === 'NewExpression' && e.callee.name === 'Date') base = 'date';
    else if (e.type === 'Identifier') base = e.name;
    else if ((e.type === 'MemberExpression' || e.type === 'OptionalMemberExpression') && !e.computed && e.property.type === 'Identifier') base = e.property.name;
    else if (e.type === 'NumericLiteral') base = 'number';
    base = base.replace(/[^\w]/g, '') || 'value';
    return /^\d/.test(base) ? `v${base}` : base;
  };

  /** Registers an interpolated expression and returns its placeholder name. */
  const allocVar = (vars, used, exprNode) => {
    const src = code.slice(exprNode.start, exprNode.end);
    let name = varNameFor(exprNode);
    const base = name;
    let k = 1;
    while (used.has(name) && used.get(name) !== src) name = `${base}${++k}`;
    used.set(name, src);
    if (!vars.some((v) => v.name === name)) vars.push({ name, src });
    return name;
  };

  const varsObject = (vars) => `{ ${vars.map((v) => (v.src === v.name ? v.name : `${v.name}: ${v.src}`)).join(', ')} }`;
  const callText = (callee, key, vars) => `${callee}(${quote(key)}${vars.length ? `, ${varsObject(vars)}` : ''})`;

  const templateToKey = (tpl) => {
    const used = new Map();
    const vars = [];
    let key = '';
    tpl.quasis.forEach((q, i) => {
      key += q.value.cooked ?? q.value.raw;
      const ex = tpl.expressions[i];
      if (ex) key += `{{${allocVar(vars, used, ex)}}}`;
    });
    return { key, vars };
  };

  const record = (key, kind) => { keys.push({ key, kind }); edits++; };

  // Strings compared with ===, used in switch/includes/lookups are data values: never translate them.
  const comparedLiterals = new Set();
  traverse(ast, {
    StringLiteral(p) {
      const par = p.parent;
      const v = p.node.value.trim();
      if (par.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(par.operator)) comparedLiterals.add(v);
      else if (par.type === 'SwitchCase' && par.test === p.node) comparedLiterals.add(v);
      else if (par.type === 'MemberExpression' && par.computed && par.property === p.node) comparedLiterals.add(v);
      else if (par.type === 'CallExpression' && par.callee.type === 'MemberExpression' && ['includes', 'indexOf', 'has', 'startsWith', 'endsWith'].includes(par.callee.property.name)) comparedLiterals.add(v);
    },
  });

  // Source ranges already rewritten as a whole (a <Trans> sentence): nothing inside may be edited again.
  const consumed = [];
  const isConsumed = (n) => consumed.some(([a, b]) => n.start >= a && n.end <= b);

  const looksTranslatable = (str, { strict = false } = {}) => {
    if (!hasLetters(str)) return false;
    const core = str.replace(/\{\{[\w.]+\}\}/g, '').replace(/<\/?\d+\s*\/?>/g, '').trim();
    if ((core.match(/\p{L}/gu) || []).length < 2) return false;                         // avatar initials, "3x"
    if (str.trim() === core && FRAGMENT_WORDS.has(core.toLowerCase()) && core === core.toLowerCase()) return false; // bare mid-sentence connectors
    if (str.length > 400) return false;
    if (/^(https?:|\/|#|\.\/|data:|mailto:|tel:)/i.test(str)) return false;
    if (/^[\w-]+(\.[\w-]+)+$/.test(str)) return false;                                   // file names, dotted keys
    if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(str.trim())) return false;                  // snake_case: icon ligature names
    if (/^[a-z][a-z0-9]*[-_]\{\{\w+\}\}$/.test(str.trim())) return false;                  // id-like templates: attach-{{i}}
    if (strict && !/[\sA-Z]/.test(str.trim()[0] || '') && !/\s/.test(str.trim())) return false;
    return true;
  };

  /** Returns false (and reports) when the text would be a broken half-sentence. */
  const safeKey = (key) => {
    if (balanced(key.replace(/<\/?\d+\s*\/?>/g, ''))) return true;
    report.push({ kind: 'fragment', text: key.slice(0, 80) });
    return false;
  };

  /** Rewrites string-ish leaves of a value expression (literal, template, ternary, ||, &&, parens). */
  const rewriteLeaves = (path, opts = {}) => {
    const node = path.node;
    if (node.type === 'StringLiteral' || node.type === 'TemplateLiteral') {
      let key;
      let vars = [];
      if (node.type === 'StringLiteral') key = node.value;
      else ({ key, vars } = templateToKey(node));
      if (/[\r\n]/.test(key) && node.type === 'TemplateLiteral') { report.push({ kind: 'multiline-template', text: key.slice(0, 60) }); return; }
      const lead = /^\s*/.exec(key)[0];
      const trail = /\s*$/.exec(key)[0];
      const trimmed = key.trim();
      if (opts.guardCompared && comparedLiterals.has(trimmed)) { report.push({ kind: 'compared', text: trimmed }); return; }
      if (!looksTranslatable(trimmed, opts) || !safeKey(trimmed)) {
        if (FRAGMENT_WORDS.has(trimmed.toLowerCase()) && trimmed === trimmed.toLowerCase()) report.push({ kind: 'fragment', text: trimmed });
        return;
      }
      const callee = useCallee(path);
      const call = callText(callee, trimmed, vars);
      const parts = [lead && quote(lead), call, trail && quote(trail)].filter(Boolean);
      s.overwrite(node.start, node.end, parts.join(' + '));
      record(trimmed, opts.kind || (node.type === 'StringLiteral' ? 'literal' : 'template'));
    } else if (node.type === 'ConditionalExpression') {
      rewriteLeaves(path.get('consequent'), opts);
      rewriteLeaves(path.get('alternate'), opts);
    } else if (node.type === 'LogicalExpression') {
      rewriteLeaves(path.get('right'), opts);
      if (node.operator !== '&&') rewriteLeaves(path.get('left'), opts);
    } else if (node.type === 'ParenthesizedExpression') {
      rewriteLeaves(path.get('expression'), opts);
    }
  };

  const SAFE_METHODS = new Set([
    'toFixed', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toUpperCase', 'toLowerCase', 'toString', 'trim',
    'join', 'slice', 'substring', 'padStart', 'padEnd', 'charAt', 'toISOString', 'getFullYear', 'getDate', 'getMonth', 'getHours', 'getMinutes',
  ]);
  const letterless = (str) => !/\p{L}/u.test(str);
  /** Names that usually hold JSX, which must never be interpolated into a string. */
  const JSXISH = /^(children|icon|element|node|component|badge|jsx|render\w*)$/i;

  const lastName = (ex) => {
    if (ex.type === 'Identifier') return ex.name;
    if ((ex.type === 'MemberExpression' || ex.type === 'OptionalMemberExpression') && !ex.computed && ex.property.type === 'Identifier') return ex.property.name;
    return null;
  };

  /** A JSX-free expression that evaluates to a plain string or number, safe to pass as an interpolation value. */
  const isSimpleRunExpr = (ex) => {
    if (!ex) return false;
    switch (ex.type) {
      case 'Identifier':
        return !JSXISH.test(ex.name);
      case 'NumericLiteral':
        return true;
      case 'StringLiteral':
        return letterless(ex.value); // {" "}, {"-"}: layout, not words
      case 'MemberExpression':
      case 'OptionalMemberExpression': {
        if (ex.computed) return false;
        if (JSXISH.test(lastName(ex) || '')) return false;
        return isSimpleRunExpr(ex.object) || ex.object.type === 'ThisExpression';
      }
      case 'LogicalExpression':
        return ['||', '??'].includes(ex.operator) && isSimpleRunExpr(ex.left) && isSimpleRunExpr(ex.right);
      case 'BinaryExpression':
        return ['+', '-', '*', '/', '%'].includes(ex.operator) && isSimpleRunExpr(ex.left) && isSimpleRunExpr(ex.right);
      case 'ConditionalExpression':
        return isSimpleRunExpr(ex.consequent) && isSimpleRunExpr(ex.alternate);
      case 'NewExpression':
        return ex.callee.type === 'Identifier' && ex.callee.name === 'Date' && ex.arguments.every(isSimpleRunExpr);
      case 'TemplateLiteral':
        return ex.quasis.every((q) => letterless(q.value.cooked ?? '')) && ex.expressions.every(isSimpleRunExpr);
      case 'CallExpression':
      case 'OptionalCallExpression': {
        const c = ex.callee;
        const argOk = (a) => ['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(a.type) || isSimpleRunExpr(a) || (a.type === 'ObjectExpression' && a.properties.every((pr) => pr.type === 'ObjectProperty' && ['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(pr.value.type)));
        if (!ex.arguments.every(argOk)) return false;
        if (!['MemberExpression', 'OptionalMemberExpression'].includes(c.type) || c.computed || c.property.type !== 'Identifier') return false;
        if (c.object.type === 'Identifier' && c.object.name === 'Math') return true;
        return SAFE_METHODS.has(c.property.name) && isSimpleRunExpr(c.object);
      }
      default:
        return false;
    }
  };

  // ── JSX children: text runs and <Trans> sentences ───────────────────────────
  const tagName = (el) => {
    const n = el.openingElement.name;
    return n.type === 'JSXIdentifier' ? n.name : null;
  };
  const classNameOf = (el) => {
    const a = el.openingElement.attributes.find((x) => x.type === 'JSXAttribute' && x.name.name === 'className');
    if (!a?.value) return '';
    return code.slice(a.value.start, a.value.end);
  };
  const isIconElement = (el) => ICON_CLASS.test(classNameOf(el));

  const isSimpleChild = (n) => n.type === 'JSXText' || (n.type === 'JSXExpressionContainer' && isSimpleRunExpr(n.expression));

  /** Element that may become a <0>…</0> tag inside a sentence. */
  const isInlineTag = (n) => {
    if (n.type !== 'JSXElement') return false;
    const tag = tagName(n);
    if (!tag || SKIP_ELEMENTS.has(tag) || isIconElement(n)) return false;
    if (!(INLINE_TAGS.has(tag) || /^[A-Z]/.test(tag))) return false;
    return n.children.every(isSimpleChild);
  };

  const classifyChild = (n) => {
    if (n.type === 'JSXText') return 'text';
    if (n.type === 'JSXExpressionContainer') return isSimpleRunExpr(n.expression) ? 'expr' : 'other';
    if (n.type === 'JSXElement') return isInlineTag(n) ? 'inline' : 'other';
    return 'other';
  };

  const hasContent = (el) => el.children.some((c) => (c.type === 'JSXText' && /\p{L}/u.test(c.value)) || c.type === 'JSXExpressionContainer');

  /** {n > 1 ? 's' : ''}, {n !== 1 && 'es'}: an English plural glued onto the preceding word. */
  const isPluralSuffix = (node) => {
    if (!node || node.type !== 'JSXExpressionContainer') return false;
    const leaves = [];
    const collect = (n) => {
      if (!n) return;
      if (n.type === 'StringLiteral') leaves.push(n.value);
      else if (n.type === 'ConditionalExpression') { collect(n.consequent); collect(n.alternate); }
      else if (n.type === 'LogicalExpression') collect(n.right);
    };
    collect(node.expression);
    return leaves.some((v) => ['s', 'es', 'S', 'ies'].includes(v));
  };

  const processChildren = (elPath) => {
    const kids = elPath.get('children');
    let i = 0;
    while (i < kids.length) {
      if (!['text', 'expr', 'inline'].includes(classifyChild(kids[i].node))) { i++; continue; }
      let j = i;
      while (j < kids.length && ['text', 'expr', 'inline'].includes(classifyChild(kids[j].node))) j++;
      const segment = kids.slice(i, j);

      if (isPluralSuffix(kids[j]?.node)) {
        const text = segment.map((k) => (k.node.type === 'JSXText' ? cleanJsxText(k.node.value) : '{…}')).join('').trim();
        if (/\p{L}/u.test(text)) report.push({ kind: 'plural-suffix', text });
        i = j + 1;
        continue;
      }
      handleSegment(segment);
      i = j;
    }
  };

  const blank = (p) => (p.node.type === 'JSXText' && !/\S/.test(p.node.value))
    || (p.node.type === 'JSXExpressionContainer' && p.node.expression.type === 'StringLiteral' && !/\S/.test(p.node.expression.value));

  const handleSegment = (all) => {
    // Whitespace-only text at either end is JSX layout, not content: leave it exactly as written.
    let a = 0;
    let b = all.length;
    while (a < b && blank(all[a])) a++;
    while (b > a && blank(all[b - 1])) b--;
    // Empty inline elements (icons, <br/>) at the edges are not part of the sentence either.
    const emptyInline = (p) => p.node.type === 'JSXElement' && p.node.children.length === 0;
    while (a < b && emptyInline(all[a])) { a++; while (a < b && blank(all[a])) a++; }
    while (b > a && emptyInline(all[b - 1])) { b--; while (b > a && blank(all[b - 1])) b--; }
    const items = all.slice(a, b);
    if (!items.some((p) => p.node.type === 'JSXText' && /\p{L}/u.test(p.node.value)) && !items.some((p) => p.node.type === 'JSXElement')) return;

    const hasContentTag = items.some((p) => p.node.type === 'JSXElement' && hasContent(p.node));
    const hasDirectText = items.some((p) => p.node.type === 'JSXText' && /\p{L}/u.test(p.node.value));
    if (hasContentTag && hasDirectText) {
      if (handleTransUnit(items)) return;
    }
    // Fallback: translate each maximal text/expression run on its own; inline tags stay in place.
    let run = [];
    const flush = () => { if (run.length) handleRun(run); run = []; };
    for (const p of items) {
      if (p.node.type === 'JSXElement') flush();
      else run.push(p);
    }
    flush();
  };

  /** Core range of a list of items: from first non-space char of the first item to last non-space char of the last. */
  const coreRange = (items) => {
    const first = items[0].node;
    const last = items[items.length - 1].node;
    let start = first.start;
    let end = last.end;
    if (first.type === 'JSXText') start = first.start + code.slice(first.start, first.end).search(/\S/);
    if (last.type === 'JSXText') end = last.start + code.slice(last.start, last.end).replace(/\s+$/, '').length;
    return { start, end };
  };

  const textPiece = (n, start, end) => {
    const from = Math.max(n.start, start);
    const to = Math.min(n.end, end);
    if (to <= from) return '';
    const raw = code.slice(from, to);
    const decoded = decodeEntities(raw);
    if (decoded === null) return null;
    return cleanJsxText(decoded);
  };

  const handleRun = (items) => {
    if (!items.some((p) => p.node.type === 'JSXText' && /\S/.test(p.node.value))) return;
    const { start, end } = coreRange(items);
    let key = '';
    const vars = [];
    const used = new Map();
    for (const p of items) {
      const n = p.node;
      if (n.type === 'JSXText') {
        const piece = textPiece(n, start, end);
        if (piece === null) { report.push({ kind: 'entity', text: code.slice(n.start, n.end).trim().slice(0, 60) }); return; }
        key += piece;
      } else {
        if (n.start < start || n.end > end) continue;
        key += n.expression.type === 'StringLiteral' ? n.expression.value : `{{${allocVar(vars, used, n.expression)}}}`;
      }
    }
    key = key.trim();
    if (!looksTranslatable(key)) {
      if (FRAGMENT_WORDS.has(key.toLowerCase()) && key === key.toLowerCase()) report.push({ kind: 'fragment', text: key });
      return;
    }
    if (!safeKey(key)) return;
    const callee = useCallee(items[0]);
    s.overwrite(start, end, `{${callText(callee, key, vars)}}`);
    record(key, 'jsx-text');
  };

  /** A sentence containing inline tags becomes one <Trans> unit so translators can reorder words and tags. */
  const handleTransUnit = (items) => {
    const { start, end } = coreRange(items);
    const vars = [];
    const used = new Map();
    const tagSources = [];
    let key = '';

    const appendChildren = (children, from, to) => {
      let out = '';
      for (const c of children) {
        if (c.type === 'JSXText') {
          const piece = textPiece(c, from, to);
          if (piece === null) return null;
          out += piece;
        } else if (c.start >= from && c.end <= to) {
          out += c.expression.type === 'StringLiteral' ? c.expression.value : `{{${allocVar(vars, used, c.expression)}}}`;
        }
      }
      return out;
    };

    for (const p of items) {
      const n = p.node;
      if (n.type === 'JSXElement') {
        const idx = tagSources.length;
        const open = code.slice(n.openingElement.start, n.openingElement.end);
        const selfClosed = n.openingElement.selfClosing ? open : `${open.slice(0, -1).trimEnd()} />`;
        tagSources.push(selfClosed);
        const inner = appendChildren(n.children, n.start, n.end);
        if (inner === null) { report.push({ kind: 'entity', text: code.slice(n.start, n.end).slice(0, 60) }); return false; }
        key += n.children.length ? `<${idx}>${inner}</${idx}>` : `<${idx}></${idx}>`;
      } else {
        const inner = appendChildren([n], start, end);
        if (inner === null) { report.push({ kind: 'entity', text: code.slice(n.start, n.end).trim().slice(0, 60) }); return false; }
        key += inner;
      }
    }
    key = key.trim();
    if (/[<>]/.test(key.replace(/<\/?\d+\s*\/?>/g, ''))) { report.push({ kind: 'fragment', text: key.slice(0, 80) }); return false; }
    if (!looksTranslatable(key) || !safeKey(key)) return false;

    const fp = enclosingComponent(items[0]);
    usesTrans = true;
    let tProp;
    if (!fp) {
      usesI18nFallback = true;
      tProp = 'i18n={i18n}';
    } else {
      componentHooks.set(fp.node, fp);
      tProp = `t={${existingT || T}}`;
    }
    // Expression containers, not attribute strings: JSX string attributes cannot contain backslash escapes.
    const props = [tProp, `i18nKey={${quote(key)}}`, `defaults={${quote(key)}}`];
    if (vars.length) props.push(`values={${varsObject(vars)}}`);
    props.push(`components={[${tagSources.join(', ')}]}`);
    s.overwrite(start, end, `<Trans ${props.join(' ')} />`);
    consumed.push([start, end]);
    record(key, 'trans');
    return true;
  };

  // ── main traversal ──────────────────────────────────────────────────────────
  traverse(ast, {
    JSXElement(p) {
      if (isConsumed(p.node)) { p.skip(); return; }
      const tag = tagName(p.node);
      if (tag && SKIP_ELEMENTS.has(tag)) return;
      if (isIconElement(p.node)) return;
      processChildren(p);
    },
    JSXFragment(p) {
      if (isConsumed(p.node)) { p.skip(); return; }
      processChildren(p);
    },

    JSXExpressionContainer(p) {
      if (isConsumed(p.node)) { p.skip(); return; }
      // {cond ? 'A' : 'B'} / {'Text'} / {cond && 'Text'} as CHILDREN
      if (!p.parentPath.isJSXElement() && !p.parentPath.isJSXFragment()) return;
      if (p.parentPath.isJSXElement()) {
        const tag = tagName(p.parentPath.node);
        if ((tag && SKIP_ELEMENTS.has(tag)) || isIconElement(p.parentPath.node)) return;
      }
      const ex = p.get('expression');
      if (isSimpleRunExpr(ex.node)) return; // handled as part of a text run
      rewriteLeaves(ex, { kind: 'jsx-expr' });
    },

    JSXAttribute(p) {
      if (isConsumed(p.node)) { p.skip(); return; }
      const attr = p.node.name.type === 'JSXIdentifier' ? p.node.name.name : '';
      if (!TEXT_ATTRS.has(attr)) return;
      const opts = { strict: !ALWAYS_TEXT_ATTRS.has(attr), kind: 'attr' };
      const v = p.get('value');
      if (!v.node) return;
      if (v.node.type === 'StringLiteral') {
        const raw = code.slice(v.node.start + 1, v.node.end - 1);
        const value = decodeEntities(raw);
        if (value === null) { report.push({ kind: 'entity', text: raw.slice(0, 60) }); return; }
        const trimmed = value.trim();
        if (!looksTranslatable(trimmed, opts) || !safeKey(trimmed)) return;
        const callee = useCallee(p);
        const lead = /^\s*/.exec(value)[0];
        const trail = /\s*$/.exec(value)[0];
        const parts = [lead && quote(lead), callText(callee, trimmed, []), trail && quote(trail)].filter(Boolean);
        s.overwrite(v.node.start, v.node.end, `{${parts.join(' + ')}}`);
        record(trimmed, 'attr');
      } else if (v.node.type === 'JSXExpressionContainer') {
        rewriteLeaves(v.get('expression'), opts);
      }
    },

    CallExpression(p) {
      if (isConsumed(p.node)) { p.skip(); return; }
      const callee = p.node.callee;
      let name = null;
      if (callee.type === 'Identifier') name = callee.name;
      else if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
        if (callee.object.name === 'toast' && callee.property.type === 'Identifier' && TOAST_METHODS.has(callee.property.name)) name = 'toast.*';
        if (callee.object.name === 'window' && callee.property.type === 'Identifier' && ['alert', 'confirm'].includes(callee.property.name)) name = 'alert';
      }
      if (!name || !(name === 'toast' || name === 'toast.*' || isMessageFn(name))) return;
      const arg = p.get('arguments.0');
      if (!arg || !arg.node) return;
      rewriteLeaves(arg, { kind: 'message' });
    },

    ObjectProperty(p) {
      if (isConsumed(p.node)) { p.skip(); return; }
      const k = p.node.key;
      const keyName = k.type === 'Identifier' ? k.name : k.type === 'StringLiteral' ? k.value : null;
      if (!keyName || !CONFIG_PROPS.has(keyName) || p.node.computed) return;
      const v = p.get('value');
      if (!['StringLiteral', 'TemplateLiteral', 'ConditionalExpression'].includes(v.node.type)) return;
      // Only config-like objects: arrays of objects / object constants assigned to a variable.
      const holder = p.parentPath.parentPath;
      const configLike = (holder.isArrayExpression() && holder.parentPath.isVariableDeclarator())
        || holder.isVariableDeclarator()
        || (holder.isObjectProperty() && holder.parentPath.parentPath.isVariableDeclarator())
        || (holder.isArrayExpression() && holder.parentPath.isCallExpression() && holder.parentPath.node.callee.name === 'useMemo');
      if (!configLike) return;
      if (!p.findParent((q) => isFn(q.node))) {
        // Module-level data cannot call a hook: mark the text so the catalog knows it, and translate where it is displayed.
        if (v.node.type === 'StringLiteral' && looksTranslatable(v.node.value.trim(), { strict: true }) && safeKey(v.node.value.trim())) {
          const raw = v.node.value;
          const trimmed = raw.trim();
          const lead = /^\s*/.exec(raw)[0];
          const trail = /\s*$/.exec(raw)[0];
          const parts = [lead && quote(lead), `tKey(${quote(trimmed)})`, trail && quote(trail)].filter(Boolean);
          s.overwrite(v.node.start, v.node.end, parts.join(' + '));
          usesTKey = true;
          report.push({ kind: 'module-constant', text: trimmed, prop: keyName });
          record(trimmed, 'constant');
        }
        return;
      }
      if (!enclosingComponent(p)) {
        if (v.node.type === 'StringLiteral' && looksTranslatable(v.node.value, { strict: true })) report.push({ kind: 'plain-function-constant', text: v.node.value, prop: keyName });
        return;
      }
      rewriteLeaves(v, { kind: 'config', strict: true });
    },

    VariableDeclarator(p) {
      if (isConsumed(p.node)) { p.skip(); return; }
      const id = p.node.id;
      if (id.type !== 'Identifier' || !p.node.init || !MESSAGE_VAR.test(id.name)) return;
      rewriteLeaves(p.get('init'), { kind: 'message-var', guardCompared: true });
    },

    AssignmentExpression(p) {
      if (isConsumed(p.node)) { p.skip(); return; }
      const l = p.node.left;
      let match = false;
      if (l.type === 'Identifier') match = MESSAGE_VAR.test(l.name);
      else if (l.type === 'MemberExpression') {
        const objName = l.object.type === 'Identifier' ? l.object.name : l.object.type === 'MemberExpression' ? l.object.property.name : '';
        if (ERROR_OBJECT.test(objName || '')) match = true;
        else if (!l.computed && l.property.type === 'Identifier' && MESSAGE_VAR.test(l.property.name)) match = true;
      }
      if (match) rewriteLeaves(p.get('right'), { kind: 'message-var', guardCompared: true });
    },

    ReturnStatement(p) {
      if (isConsumed(p.node) || !p.node.argument) return;
      const fp = p.getFunctionParent();
      if (!fp) return;
      const name = fnNameOf(fp) || '';
      if (!LABEL_FN.test(name) || /(id|key|code|class|color|type)$/i.test(name)) return;
      rewriteLeaves(p.get('argument'), { kind: 'return', guardCompared: true });
    },

    ClassMethod(p) {
      if (p.node.key.name === 'render') {
        let has = false;
        p.traverse({ JSXText(q) { if (/\p{L}/u.test(q.node.value)) has = true; } });
        if (has) report.push({ kind: 'class-component', text: file });
      }
    },
  });

  if (edits === 0) return { edits: 0, keys: [], report };

  // ── insert hooks ────────────────────────────────────────────────────────────
  const lineIndent = (pos) => {
    const lineStart = code.lastIndexOf('\n', pos - 1) + 1;
    return /^[ \t]*/.exec(code.slice(lineStart))[0];
  };
  const alreadyHasHook = (fp) => existingT && fp.scope.hasBinding(existingT);
  for (const fp of componentHooks.values()) {
    if (alreadyHasHook(fp)) continue;
    const body = fp.node.body;
    const decl = `const { ${T === 't' ? 't' : `t: ${T}`} } = useTranslation(${quote(ns)});`;
    if (body.type === 'BlockStatement') {
      const first = body.body[0];
      const indent = first ? lineIndent(first.start) : `${lineIndent(fp.node.start)}  `;
      s.appendLeft(body.start + 1, `\n${indent}${decl}`);
    } else {
      const parenStart = body.extra?.parenthesized ? body.extra.parenStart : body.start;
      let endPos = body.end;
      if (body.extra?.parenthesized) endPos = code.indexOf(')', body.end) + 1;
      const indent = lineIndent(fp.node.start);
      s.appendLeft(parenStart, `{\n${indent}  ${decl}\n${indent}  return `);
      s.appendRight(endPos, `;\n${indent}}`);
    }
  }
  const needsUseTranslation = [...componentHooks.values()].some((fp) => !alreadyHasHook(fp));

  // ── imports ─────────────────────────────────────────────────────────────────
  const wanted = [];
  if (usesTrans) wanted.push('Trans');
  if (needsUseTranslation) wanted.push('useTranslation');
  const importDecls = ast.program.body.filter((n) => n.type === 'ImportDeclaration');
  const existingI18next = importDecls.find((n) => n.source.value === 'react-i18next');
  const importLines = [];
  if (wanted.length) {
    if (existingI18next) {
      const have = existingI18next.specifiers.filter((sp) => sp.type === 'ImportSpecifier').map((sp) => code.slice(sp.start, sp.end));
      const merged = [...new Set([...have, ...wanted])].sort();
      if (merged.length !== have.length) s.overwrite(existingI18next.start, existingI18next.end, `import { ${merged.join(', ')} } from "react-i18next";`);
    } else {
      importLines.push(`import { ${wanted.sort().join(', ')} } from "react-i18next";`);
    }
  }
  if (usesI18nFallback && !hasFileI18nImport) importLines.push(`import i18n from "${importPathToI18n}";`);
  if (usesTKey && !/tKey[^;]*from\s+['"][^'"]*shared\/i18n/.test(code)) importLines.push(`import { tKey } from "${importPathToI18n}";`);
  if (importLines.length) {
    const insertAt = importDecls.length ? importDecls[importDecls.length - 1].end : 0;
    s.appendLeft(insertAt, `${importDecls.length ? '\n' : ''}${importLines.join('\n')}${importDecls.length ? '' : '\n'}`);
  }

  return { code: s.toString(), edits, keys, report, alias: T };
}

// ─── file selection ───────────────────────────────────────────────────────────

const toPosix = (p) => p.split(path.sep).join('/');

export function relImport(fromFile) {
  let rel = toPosix(path.relative(path.dirname(fromFile), path.dirname(I18N_MODULE)));
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

/** Every file a panel really loads, with the namespace its strings belong to. Dead legacy files are skipped. */
export function listTargets(onlyFiles) {
  const byPanel = reachableByPanel();
  const panelsOf = new Map();
  for (const [panel, files] of Object.entries(byPanel)) {
    for (const f of files) {
      if (!panelsOf.has(f)) panelsOf.set(f, new Set());
      panelsOf.get(f).add(panel);
    }
  }

  const out = [];
  for (const [file, panels] of panelsOf) {
    const posix = toPosix(file);
    if (NEVER.some((re) => re.test(posix))) continue;
    if (onlyFiles && !onlyFiles.some((f) => posix.endsWith(toPosix(f)))) continue;
    const rel = toPosix(path.relative(SRC, file));
    const owner = OWNED.find((o) => rel.startsWith(`${o.dir}/`));
    let ns;
    if (owner) ns = owner.ns;
    else if (rel.startsWith('modules/Food/') || rel.startsWith('shared/') || rel.startsWith('core/') || rel.startsWith('components/')) {
      const set = [...panels].filter((p) => p !== 'auth');
      ns = set.length === 1 && !panels.has('auth') ? PANEL_TO_NS[set[0]] : 'common';
    } else continue;
    out.push({ file, ns });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

if (process.argv[1]?.endsWith('codemod.mjs')) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const filesIdx = args.indexOf('--files');
  const only = filesIdx >= 0 ? args.slice(filesIdx + 1).filter((a) => !a.startsWith('--')) : null;
  const jsonIdx = args.indexOf('--json');
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

  const summary = { files: 0, changed: 0, strings: 0, byNs: {}, byKind: {}, skipped: [], report: {} };
  for (const { file, ns } of listTargets(only)) {
    summary.files++;
    const code = fs.readFileSync(file, 'utf8');
    const res = processSource(code, { ns, file, importPathToI18n: relImport(file) });
    const rel = toPosix(path.relative(FRONTEND, file));
    if (res.skipped) { summary.skipped.push({ file: rel, reason: res.skipped }); continue; }
    if (res.report.length) summary.report[rel] = res.report;
    if (!res.edits) continue;
    summary.changed++;
    summary.strings += res.edits;
    summary.byNs[ns] = (summary.byNs[ns] || 0) + res.edits;
    res.keys.forEach((k) => { summary.byKind[k.kind] = (summary.byKind[k.kind] || 0) + 1; });
    if (write) fs.writeFileSync(file, res.code);
  }
  const reportCounts = {};
  Object.values(summary.report).flat().forEach((r) => { reportCounts[r.kind] = (reportCounts[r.kind] || 0) + 1; });
  console.log(JSON.stringify({ mode: write ? 'WRITE' : 'DRY RUN', ...summary, report: undefined, reportCounts }, null, 2));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
}
