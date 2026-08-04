#!/usr/bin/env node
/**
 * Convert i18n from dotted-key to English-text-as-key.
 * 1. Build key->en map from en/*.json
 * 2. Replace t('dotted.key') -> t('English Value') in all .ts/.tsx
 * 3. Build zh-CN/*.json with English-text-as-key -> Chinese value (only where different)
 * 4. Delete en/*.json
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join, extname } from 'path';

const ROOT = process.cwd();
const I18N_DIR = join(ROOT, 'packages/frontend/src/i18n/locales');
const SRC_DIR = join(ROOT, 'packages/frontend/src');

const enMap = {};
const zhMap = {};
for (const file of readdirSync(join(I18N_DIR, 'en')).filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(join(I18N_DIR, 'en', file), 'utf8'));
  Object.assign(enMap, data);
}
for (const file of readdirSync(join(I18N_DIR, 'zh-CN')).filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(join(I18N_DIR, 'zh-CN', file), 'utf8'));
  Object.assign(zhMap, data);
}
console.log('Loaded ' + Object.keys(enMap).length + ' en keys, ' + Object.keys(zhMap).length + ' zh keys');

function findFiles(dir, exts) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.turbo', 'dist-ssr', 'coverage'].includes(entry.name)) {
        result.push(...findFiles(full, exts));
      }
    } else if (exts.includes(extname(entry.name))) {
      result.push(full);
    }
  }
  return result;
}

const files = findFiles(SRC_DIR, ['.ts', '.tsx']);
console.log('Scanning ' + files.length + ' source files');

let replaced = 0, skipped = 0;
const T_REGEX = /\bt\(\s*['"]([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)['"]\s*([,)])/g;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  let modified = false;
  content = content.replace(T_REGEX, (match, key, suffix) => {
    const enVal = enMap[key];
    if (enVal === undefined || typeof enVal !== 'string' || !enVal) { skipped++; return match; }
    const hasSQ = enVal.includes("'");
    const quote = hasSQ ? '"' : "'";
    const escaped = hasSQ ? enVal.replace(/"/g, '\\"') : enVal.replace(/'/g, "\\'");
    replaced++;
    modified = true;
    return 't(' + quote + escaped + quote + suffix;
  });
  if (modified) writeFileSync(file, content);
}
console.log('Replaced ' + replaced + ' t() calls, skipped ' + skipped);

const zhNew = {};
let zhKept = 0, zhDropped = 0;
for (const [dottedKey, zhVal] of Object.entries(zhMap)) {
  const enVal = enMap[dottedKey];
  if (enVal === undefined || typeof enVal !== 'string') {
    const ns = dottedKey.split('.')[0];
    zhNew[ns] = zhNew[ns] || {};
    zhNew[ns][dottedKey] = zhVal;
    zhKept++;
  } else if (zhVal === enVal) {
    zhDropped++;
  } else {
    zhNew['common'] = zhNew['common'] || {};
    zhNew['common'][enVal] = zhVal;
    zhKept++;
  }
}
console.log('zh-CN: kept ' + zhKept + ' entries, dropped ' + zhDropped + ' (same as en)');

const NS_LIST = ['common', 'account', 'admin', 'analysis', 'auth', 'backtest', 'legal', 'pages'];
for (const ns of NS_LIST) {
  const entries = zhNew[ns] || {};
  const sorted = Object.fromEntries(Object.keys(entries).sort().map(k => [k, entries[k]]));
  writeFileSync(join(I18N_DIR, 'zh-CN', ns + '.json'), JSON.stringify(sorted, null, 2) + '\n');
}

for (const file of readdirSync(join(I18N_DIR, 'en')).filter(f => f.endsWith('.json'))) {
  unlinkSync(join(I18N_DIR, 'en', file));
  console.log('Deleted en/' + file);
}
console.log('\nDone! Update i18n/index.ts: set partialBundledLanguages: true');
