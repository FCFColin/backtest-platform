#!/usr/bin/env node
/**
 * audit-code-static.mjs — 静态代码审计脚本 (P0-0-5)
 *
 * 通过正则扫描 packages/frontend/src 下的源码，检测：
 * 1. @deprecated 组件是否被 import
 * 2. V2 组件与非 V2 组件并存
 * 3. 硬编码颜色
 * 4. 硬编码字号
 * 5. 裸 Input
 * 6. em-dash
 * 7. Console.log 残留
 * 8. TODO / FIXME
 * 9. h-screen 残留
 * 10. bg-slate-*
 *
 * 用法：node scripts/audit-code-static.mjs
 * 退出码：0=始终通过（结果仅作 baseline 参考）
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'packages/frontend/src');

/**
 * Walk directory recursively, returning all files matching extensions.
 * @param {string} dir - Directory to walk.
 * @param {string[]} exts - File extensions to include (e.g. ['.tsx', '.ts']).
 * @param {string[]} exclude - Filenames to exclude.
 * @returns {{path: string, content: string}[]} Files with content.
 */
function walkAndRead(dir, exts, exclude = []) {
  const result = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return result;
  }
  for (const name of entries) {
    if (exclude.includes(name)) continue;
    const fullPath = join(dir, name);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      result.push(...walkAndRead(fullPath, exts, exclude));
    } else if (exts.some((ext) => name.endsWith(ext))) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        result.push({ path: fullPath, content });
      } catch {
        // ignore read errors
      }
    }
  }
  return result;
}

const tsFiles = walkAndRead(SRC, ['.tsx', '.ts'], ['chart-theme.ts', 'index.css']);
const tsxFiles = tsFiles.filter((f) => f.path.endsWith('.tsx'));

/**
 * Apply regex across files, returning matches with file paths.
 * @param {RegExp} regex - Pattern to match.
 * @param {{path: string, content: string}[]} files - Files to search.
 * @param {number} limit - Max results.
 * @returns {string[]} Matching lines (path:line:content).
 */
function grepFiles(regex, files, limit = 30) {
  const matches = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        const relPath = file.path.replace(SRC + '\\', '').replace(SRC + '/', '');
        matches.push(`${relPath}:${i + 1}:${lines[i].trim()}`);
        if (matches.length >= limit) return matches;
      }
    }
  }
  return matches;
}

const audits = {
  deprecatedImports: (() => {
    const deprecatedHits = grepFiles(/@deprecated/, tsFiles);
    return deprecatedHits
      .map((line) => {
        const file = line.split(':')[0];
        const componentName = file.match(/\/([A-Z][a-zA-Z]+)\.tsx$/)?.[1];
        if (!componentName) return null;
        const importers = grepFiles(new RegExp(`import.*\\b${componentName}\\b`), tsFiles.filter((f) => !f.path.endsWith(`${componentName}.tsx`)));
        return {
          file,
          componentName,
          importedIn: importers.length,
          importers: importers.slice(0, 5),
        };
      })
      .filter(Boolean)
      .filter((x) => x.importedIn > 0);
  })(),

  v2Components: (() => {
    const v2Files = tsxFiles.filter((f) => /V2\.tsx$/.test(f.path));
    const dupes = [];
    for (const v2 of v2Files) {
      const v2Rel = v2.path.replace(SRC + '\\', '').replace(SRC + '/', '');
      const v1Path = v2.path.replace(/V2\.tsx$/, '.tsx');
      const v1Exists = tsxFiles.some((f) => f.path === v1Path);
      if (v1Exists) {
        const v1Rel = v1Path.replace(SRC + '\\', '').replace(SRC + '/', '');
        dupes.push({ v1: v1Rel, v2: v2Rel });
      }
    }
    return dupes;
  })(),

  hardcodedColors: grepFiles(/#[0-9a-fA-F]{6}\b/, tsFiles, 30),

  hardcodedFontSize: grepFiles(/text-\[\d+px\]/, tsxFiles, 30),

  fixedWidthUsage: grepFiles(/w-\[\d+px\]/, tsxFiles, 9999).length,

  bareInputs: (() => {
    const allInputs = grepFiles(/<Input/, tsxFiles, 9999);
    return allInputs
      .filter((line) => !line.includes('className') || !line.match(/className[^"]*"[^"]*w-/))
      .slice(0, 20);
  })(),

  emDashInCode: grepFiles(/—/, tsFiles, 20),

  consoleLog: grepFiles(/console\./, tsFiles, 20).filter(
    (l) => !l.includes('// eslint-disable') && !l.includes('logger'),
  ),

  todos: grepFiles(/TODO|FIXME|HACK|XXX/, tsFiles, 9999).length,

  hScreen: grepFiles(/h-screen/, tsxFiles, 10),

  bgSlate: grepFiles(/bg-slate-|text-slate-/, tsxFiles, 20),

  maxWidthUsage: grepFiles(/max-w-\[\d+/, tsxFiles, 9999).length,
};

const summary = {
  timestamp: new Date().toISOString(),
  criticalIssues: {
    deprecatedStillImported: audits.deprecatedImports.length,
    v1v2Coexist: audits.v2Components.length,
    bareInputs: audits.bareInputs.length,
    hardcodedColors: audits.hardcodedColors.length,
    consoleLogsInProduction: audits.consoleLog.length,
  },
  audits,
};

const reportPath = resolve(ROOT, 'docs/audit/reports/p0-0-5-code-audit.json');
writeFileSync(reportPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.criticalIssues, null, 2));
console.log(`\nFull report: ${reportPath}`);
