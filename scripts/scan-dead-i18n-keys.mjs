/**
 * Scans for dead i18n keys — keys present in locale JSON files but never referenced
 * in any .ts/.tsx source file via t('key.path') calls.
 *
 * Usage: node scripts/scan-dead-i18n-keys.mjs [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, '..');
const localesDir = path.resolve(projectRoot, 'packages/frontend/src/i18n/locales');
const dryRun = process.argv.includes('--dry-run');

// 1. Collect all source files
const srcDirs = [
  'packages/frontend/src',
  'packages/backend/src',
  'packages/shared',
  'tests',
];
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'i18n' || entry.name === '.turbo') continue;
      walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') === false || /\.(ts|tsx)$/.test(entry.name)) {
      if (entry.name.endsWith('.d.ts')) continue;
      sourceFiles.push(full);
    }
  }
}
for (const d of srcDirs) {
  const full = path.resolve(projectRoot, d);
  if (fs.existsSync(full)) walk(full);
}

// 2. Scan for t('...') and t("...") calls
const usedKeys = new Set();
const usedPrefixes = new Set();
const tCallPattern = /\bt\s*\(\s*['"`]([^'"`]+)['"`]/g;

for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = tCallPattern.exec(content)) !== null) {
    const key = match[1];
    usedKeys.add(key);
    // Add all parent prefixes
    const parts = key.split('.');
    for (let i = 1; i <= parts.length; i++) {
      usedPrefixes.add(parts.slice(0, i).join('.'));
    }
  }
}

console.log(`Scanned ${sourceFiles.length} source files, found ${usedKeys.size} used keys`);

// 3. For each locale JSON file, find dead keys
let totalRemoved = 0;
let totalBefore = 0;
let totalAfter = 0;

function walkJson(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = walkJson(value, fullKey);
      if (Object.keys(nested).length > 0) {
        result[key] = nested;
      }
    } else {
      // Leaf key — check if used
      if (usedKeys.has(fullKey) || usedPrefixes.has(fullKey)) {
        result[key] = value;
      } else {
        totalRemoved++;
      }
    }
  }
  return result;
}

for (const lang of ['en', 'zh-CN']) {
  const langDir = path.resolve(localesDir, lang);
  if (!fs.existsSync(langDir)) continue;
  for (const file of fs.readdirSync(langDir).filter(f => f.endsWith('.json'))) {
    const filePath = path.join(langDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const beforeLines = content.split('\n').length;
    totalBefore += beforeLines;
    const cleaned = walkJson(data);
    const cleanedJson = JSON.stringify(cleaned, null, 2) + '\n';
    const afterLines = cleanedJson.split('\n').length;
    totalAfter += afterLines;
    const removed = beforeLines - afterLines;
    if (removed > 0) {
      console.log(`  ${lang}/${file}: ${beforeLines} → ${afterLines} lines (-${removed})`);
      if (!dryRun) {
        fs.writeFileSync(filePath, cleanedJson);
      }
    }
  }
}

console.log(`\nTotal: ${totalBefore} → ${totalAfter} lines (-${totalBefore - totalAfter}), ${totalRemoved} keys removed${dryRun ? ' (dry-run)' : ''}`);
