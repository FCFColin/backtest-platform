import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// 从脚本自身位置推导仓库根，避免从子目录调用时 cwd 漂移
const PROJECT_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const VERIFY_DIR = join(PROJECT_ROOT, 'scripts', 'verify');
const OUTPUT_DIR = join(PROJECT_ROOT, 'docs', 'audit', 'verify');

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const patternArg = args.find((a) => a.startsWith('--pattern='))?.split('=')[1];
const skipFrontend = args.includes('--skip-frontend');
const skipDb = args.includes('--skip-db');
const runStartMs = Date.now();

const allScripts = readdirSync(VERIFY_DIR)
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'run-all.mjs')
  .sort();

let scripts = allScripts;
if (onlyArg) scripts = allScripts.filter((f) => f.startsWith(onlyArg));
else if (patternArg) scripts = allScripts.filter((f) => new RegExp(patternArg).test(f));
if (skipFrontend) scripts = scripts.filter((f) => f !== 'verify-frontend.mjs');
if (skipDb) scripts = scripts.filter((f) => f !== 'verify-backend.mjs');

console.log(`\n=== Critical Fixes Verification Runner ===`);
console.log(`Found ${scripts.length} verification script(s) to run\n`);

if (scripts.length === 0) {
  console.log('No verification scripts found.');
  process.exit(0);
}

const results = [];
for (const script of scripts) {
  console.log(`\n--- Running ${script} ---`);
  const start = Date.now();
  const r = spawnSync('node', [join(VERIFY_DIR, script)], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 600000,
  });
  const elapsed = Date.now() - start;
  const exitCode = r.status ?? -1;
  const stdout = (r.stdout ?? '').trim();
  const stderr = (r.stderr ?? '').trim();
  if (stdout) console.log(stdout);
  if (stderr) console.error('STDERR:', stderr);
  console.log(`--- ${script} exited code=${exitCode} in ${elapsed}ms ---`);
  results.push({ script, exitCode, elapsed });
}

const issueResults = [];
const scriptNames = new Set(scripts.map((s) => s.replace(/\.mjs$/, '')));
if (existsSync(OUTPUT_DIR)) {
  for (const f of readdirSync(OUTPUT_DIR)) {
    if (!f.endsWith('-reverify.json')) continue;
    const aggregateId = f.replace(/-reverify\.json$/, '');
    if (!scriptNames.has(aggregateId)) continue;
    let data;
    try {
      data = JSON.parse(readFileSync(join(OUTPUT_DIR, f), 'utf-8'));
    } catch {
      continue;
    }
    // 只采纳本次运行新写的结果；脚本崩溃/未运行时遗留的过期文件不计入报告
    const writtenAt = Date.parse(data.timestamp ?? '');
    if (Number.isNaN(writtenAt) || writtenAt < runStartMs) continue;
    if (data.results && typeof data.results === 'object' && !Array.isArray(data.results)) {
      for (const [subId, sub] of Object.entries(data.results)) {
        const id = /^(C|H)\d+$/.test(subId) ? subId.replace(/^(C|H)(\d+)$/, '$1-$2') : subId;
        issueResults.push({ issueId: id, script: aggregateId, ...sub });
      }
    } else if (data.issueId) issueResults.push({ ...data, script: aggregateId });
  }
}

const pass = issueResults.filter((r) => r.status === 'PASS').length;
const fail = issueResults.filter((r) => r.status === 'FAIL').length;
const skip = issueResults.filter((r) => r.status === 'SKIP').length;

const rows = issueResults
  .sort((a, b) => a.issueId.localeCompare(b.issueId))
  .map((r) => {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'SKIP' ? '○' : '✗';
    const script = r.script ?? '-';
    const summary = (r.summary ?? '').replace(/\|/g, '\\|').slice(0, 200);
    return `| ${r.issueId} | ${icon} ${r.status} | ${summary} | ${script} |`;
  })
  .join('\n');

const scriptRows = results.map((r) => `| ${r.script} | ${r.exitCode} | ${r.elapsed} |`).join('\n');

const md = `# CRITICAL 修复验证汇总报告

**生成时间**：${new Date().toISOString()}

**汇总**：✓ PASS=${pass}  ✗ FAIL=${fail}  ○ SKIP=${skip}  (总计 ${issueResults.length})

## 详细结果

| Issue ID | 状态 | 摘要 | 验证脚本 |
|----------|------|------|----------|
${rows}

## 脚本执行情况

| 脚本 | 退出码 | 耗时(ms) |
|------|--------|----------|
${scriptRows}
`;

writeFileSync(join(OUTPUT_DIR, 'SUMMARY.md'), md);
console.log(`\nPASS=${pass} FAIL=${fail} SKIP=${skip} / total=${issueResults.length}`);
process.exit(fail > 0 || results.some((r) => r.exitCode !== 0) ? 1 : 0);
