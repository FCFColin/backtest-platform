#!/usr/bin/env node
/** Flatten all i18n JSON files: nested { "a": { "b": "v" } } → flat { "a.b": "v" } */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const localesDir = join(process.cwd(), 'packages/frontend/src/i18n/locales');

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

let totalBefore = 0, totalAfter = 0;

for (const lang of readdirSync(localesDir)) {
  const langDir = join(localesDir, lang);
  for (const file of readdirSync(langDir).filter(f => f.endsWith('.json'))) {
    const path = join(langDir, file);
    const before = JSON.parse(readFileSync(path, 'utf8'));
    const beforeLines = readFileSync(path, 'utf8').split('\n').length;
    const flat = flatten(before);
    const sorted = Object.fromEntries(Object.keys(flat).sort().map(k => [k, flat[k]]));
    const out = JSON.stringify(sorted, null, 2) + '\n';
    const afterLines = out.split('\n').length;
    writeFileSync(path, out);
    totalBefore += beforeLines;
    totalAfter += afterLines;
    console.log(`${lang}/${file}: ${beforeLines} → ${afterLines} (-${beforeLines - afterLines})`);
  }
}

console.log(`\nTotal: ${totalBefore} → ${totalAfter} (-${totalBefore - totalAfter})`);
