#!/usr/bin/env node
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
function loadMerged(lang) {
  const merged = {};
  const dir = join(LOCALES_DIR, lang);
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(join(dir, name), 'utf-8'));
    Object.assign(merged, data);
  }
  return merged;
}

const zh = loadMerged('zh-CN');
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
const unusedZh = [...zhKeys].filter((k) => !usedKeys.has(k) && !k.startsWith('_'));

const report = {
  timestamp: new Date().toISOString(),
  zhKeyCount: zhKeys.size,
  usedKeyCount: usedKeys.size,
  undefinedInSource,
  unusedZh: unusedZh.slice(0, 20),
  status: undefinedInSource.length === 0 ? 'PASS' : 'FAIL',
};

const reportJson = JSON.stringify(report, null, 2);
console.log(reportJson);

const reportDir = resolve(ROOT, 'docs/audit/reports');
mkdirSync(reportDir, { recursive: true });
const reportPath = join(reportDir, 'p0-0-2-i18n-baseline.json');
writeFileSync(reportPath, reportJson);

process.exit(report.status === 'PASS' ? 0 : 1);
