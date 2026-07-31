#!/usr/bin/env node
/**
 * verify-i18n.mjs — i18n 双语同步验证脚本 (P0-0-2)
 *
 * 检查 zh-CN / en 两个语言目录（各命名空间 JSON 合并）之间 key 是否对齐，
 * 以及前端源代码中使用的 t('xxx') key 是否全部已定义。
 *
 * 用法：node scripts/verify-i18n.mjs
 * 退出码：0=PASS，1=FAIL
 */
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
const en = loadMerged('en');

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
const enFlat = flatten(en);
const zhKeys = new Set(Object.keys(zhFlat));
const enKeys = new Set(Object.keys(enFlat));

const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));

// Collect all t('xxx') / t("xxx") / i18nKey="xxx" usages from source
const sourceFiles = walkDir(srcDir, ['.tsx', '.ts']);
const usedKeys = new Set();
const keyRegex = /\bt\(['"]([a-zA-Z0-9_.\-]+)['"]/g;
const i18nKeyRegex = /i18nKey=['"]([a-zA-Z0-9_.\-]+)['"]/g;
// Also catch useTranslation namespace prefix: t('foo.bar') within ns 'baz' → baz.foo.bar
// Simple approach: just collect literal keys; namespace resolution handled elsewhere.

for (const file of sourceFiles) {
  let content;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    continue;
  }
  let match;
  while ((match = keyRegex.exec(content)) !== null) {
    usedKeys.add(match[1]);
  }
  while ((match = i18nKeyRegex.exec(content)) !== null) {
    usedKeys.add(match[1]);
  }
}

// Use allPaths (includes intermediate object keys) so that keys referenced via
// `t(key, { returnObjects: true })` — which point to nested objects, not leaf
// strings — are not falsely flagged as undefined.
const zhAllPaths = allPaths(zh);
const undefinedInSource = [...usedKeys].filter((k) => !zhAllPaths.has(k));
const unusedZh = [...zhKeys].filter((k) => !usedKeys.has(k) && !k.startsWith('_'));

const report = {
  timestamp: new Date().toISOString(),
  zhKeyCount: zhKeys.size,
  enKeyCount: enKeys.size,
  usedKeyCount: usedKeys.size,
  missingInEn,
  missingInZh,
  undefinedInSource,
  unusedZh: unusedZh.slice(0, 20),
  status:
    missingInEn.length + missingInZh.length + undefinedInSource.length === 0 ? 'PASS' : 'FAIL',
};

const reportJson = JSON.stringify(report, null, 2);
console.log(reportJson);

const reportDir = resolve(ROOT, 'docs/audit/reports');
mkdirSync(reportDir, { recursive: true });
const reportPath = join(reportDir, 'p0-0-2-i18n-baseline.json');
writeFileSync(reportPath, reportJson);

process.exit(report.status === 'PASS' ? 0 : 1);
