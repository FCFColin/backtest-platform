#!/usr/bin/env node
// ── 统计口径（ADR-013 同期治理，修改任一函数前必读）──────────────
// 叶键：flatten() 的终端节点（string/number/boolean/null/数组整体）；
//      空字符串计叶。zhKeyCount/unusedZh 均基于叶键全集。
// used 来源四通道：t('..')/t("..")、i18nKey|titleKey|descKey 属性、
//      t(`模板.${dyn}`)（${}→[^.]+ 单段通配，对 allPaths 正则匹配）、
//      returnObjects 中间节点（命中非叶路径时其后代叶键并入 used，见下方叶扩展）。
// protectedDynamicKeys：DYNAMIC_KEY_PREFIXES 命中的未引用键，不计入 unused。
// 退出码语义不变：PASS=undefinedInSource 为空 → 0；FAIL → 非 0。
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const LOCALES_DIR = join(ROOT, 'packages/frontend/src/i18n/locales');
const srcDir = join(ROOT, 'packages/frontend/src');

/**
 * Merge every <lang>/<ns>.json file in a locale dir into one object,
 * mirroring how the runtime loads namespaces via loadNamespace().
 * @param {string} lang - Locale dir name (e.g. 'zh-CN').
 * @returns {Record<string, unknown>} Merged namespace object.
 */
function loadMergedWithNs(lang) {
  const merged = {};
  const nsOf = {};
  const dir = join(LOCALES_DIR, lang);
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const ns = name.replace(/\.json$/, '');
    const data = JSON.parse(readFileSync(join(dir, name), 'utf-8'));
    for (const k of Object.keys(flatten(data))) nsOf[k] = ns;
    Object.assign(merged, data);
  }
  return { merged, nsOf };
}

const { merged: zh, nsOf } = loadMergedWithNs('zh-CN');
/**
 * Flatten nested object to dot-notation keys.
 * @param {Record<string, unknown>} obj - Object to flatten.
 * @param {string} prefix - Current key prefix.
 * @returns {Record<string, unknown>} Flattened object.
 */
function flatten(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      Object.assign(result, flatten(/** @type {Record<string, unknown>} */ (v), key));
    } else {
      result[key] = v;
    }
  }
  return result;
}

/**
 * Collect all dot-notation paths in an object, including intermediate object keys
 * (not just leaf values). Used to verify keys used with `t(key, { returnObjects: true })`,
 * which reference a nested object rather than a leaf string.
 * @param {Record<string, unknown>} obj - Object to traverse.
 * @param {string} prefix - Current key prefix.
 * @returns {Set<string>} Set of all dot-notation paths (leaves and intermediate).
 */
function allPaths(obj, prefix = '') {
  const result = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    result.add(key);
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      for (const sub of allPaths(/** @type {Record<string, unknown>} */ (v), key)) result.add(sub);
    }
  }
  return result;
}

/**
 * Walk directory recursively, returning all files matching extensions.
 * @param {string} dir - Directory to walk.
 * @param {string[]} exts - File extensions to include (e.g. ['.tsx', '.ts']).
 * @returns {string[]} Absolute file paths.
 */
function walkDir(dir, exts) {
  const result = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return result;
  }
  for (const name of entries) {
    const fullPath = join(dir, name);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      result.push(...walkDir(fullPath, exts));
    } else if (exts.some((ext) => name.endsWith(ext))) {
      result.push(fullPath);
    }
  }
  return result;
}

const zhFlat = flatten(zh);
const zhKeys = new Set(Object.keys(zhFlat));

// Collect all t('xxx') / t("xxx") / i18nKey="xxx" / titleKey / descKey usages from source
// 覆盖点分键、英文句子键与含 {{}}/空格/中文的键名（[a-zA-Z0-9_.-] 字符集过窄会漏检）
const sourceFiles = walkDir(srcDir, ['.tsx', '.ts']);
const usedKeys = new Set();
const keyRegex = /(?<![\w$])t\(('([^'\n]+)'|"([^"\n]+)")/g;
const propKeyRegex = /\b(?:i18nKey|titleKey|descKey)=('([^'\n]+)'|"([^"\n]+)")/g;
// t(`legal.${prefix}.title`) 模板 key 无法静态解析，转成正则模式后与现有 key 匹配校验
const templateKeyRegex = /\bt\(`((?:[^$`]|\${[^}]+})+?)`/g;
// Also catch useTranslation namespace prefix: t('foo.bar') within ns 'baz' → baz.foo.bar
// Simple approach: just collect literal keys; namespace resolution handled elsewhere.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function templateKeyPattern(tmpl) {
  let pattern = '';
  let last = 0;
  const dynRe = /\$\{[^}]+\}/g;
  let m;
  while ((m = dynRe.exec(tmpl)) !== null) {
    pattern += escapeRegex(tmpl.slice(last, m.index)) + '[^.]+';
    last = m.index + m[0].length;
  }
  return pattern + escapeRegex(tmpl.slice(last));
}

for (const file of sourceFiles) {
  let content;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    continue;
  }
  let match;
  while ((match = keyRegex.exec(content)) !== null) {
    usedKeys.add((match[2] ?? match[3]).replace(/\\n/g, '\n'));
  }
  while ((match = propKeyRegex.exec(content)) !== null) {
    usedKeys.add((match[2] ?? match[3]).replace(/\\n/g, '\n'));
  }
  while ((match = templateKeyRegex.exec(content)) !== null) {
    usedKeys.add(`~${templateKeyPattern(match[1])}`);
  }
}

// Use allPaths (includes intermediate object keys) so that keys referenced via
// `t(key, { returnObjects: true })` — which point to nested objects, not leaf
// strings — are not falsely flagged as undefined.
const zhAllPaths = allPaths(zh);
const undefinedInSource = [...usedKeys].filter(
  (k) =>
    !(k.startsWith('~')
      ? [...zhAllPaths].some((p) => new RegExp(`^${k.slice(1)}$`).test(p))
      : zhAllPaths.has(k)),
);
// returnObjects 语义补全：used 键命中中间分组节点时，其全部后代叶键视为已使用，
// 否则 D-5 会据 unused 误删运行时实际在用的子叶（删除事故防线）
for (const k of [...usedKeys]) {
  if (!k.startsWith('~') && !zhKeys.has(k) && zhAllPaths.has(k)) {
    for (const leaf of Object.keys(zhFlat)) {
      if (leaf.startsWith(`${k}.`)) usedKeys.add(leaf);
    }
  }
}

const unusedRaw = [...zhKeys].filter((k) => !usedKeys.has(k) && !k.startsWith('_'));

// §5-D 动态 key 保护桶：t(`x.${dyn}`) 模板串接对静态扫描不可见，
// 这些前缀下的全部叶子键不得计入 unused（含常量中转，如 BacktestOptimizerPage 的 OPT）。
const DYNAMIC_KEY_PREFIXES = [
  'dataEngine.',
  'nav.',
  'account.preferences.',
  'backtest.optimizer.',
  'efficientFrontier.rebalanceFreq.',
  'efficientFrontier.solver.',
  'legal.',
  'monteCarlo.presets.',
  'rebalancingSensitivity.tab.',
];
const isProtected = (k) => DYNAMIC_KEY_PREFIXES.some((p) => k.startsWith(p));
const unusedZh = unusedRaw.filter((k) => !isProtected(k));

const unusedByNamespace = {};
for (const k of unusedZh) {
  const ns = nsOf[k] ?? 'unknown';
  unusedByNamespace[ns] = (unusedByNamespace[ns] ?? 0) + 1;
}

const report = {
  timestamp: new Date().toISOString(),
  zhKeyCount: zhKeys.size,
  usedKeyCount: usedKeys.size,
  undefinedInSource,
  unusedCount: unusedZh.length,
  protectedDynamicKeys: unusedRaw.length - unusedZh.length,
  unusedByNamespace,
  unusedZh,
  status: undefinedInSource.length === 0 ? 'PASS' : 'FAIL',
};

const reportJson = JSON.stringify(report, null, 2);
console.log(reportJson);

const reportDir = resolve(ROOT, 'docs/audit/reports');
mkdirSync(reportDir, { recursive: true });
const reportPath = join(reportDir, 'p0-0-2-i18n-baseline.json');
writeFileSync(reportPath, reportJson);

process.exit(report.status === 'PASS' ? 0 : 1);
