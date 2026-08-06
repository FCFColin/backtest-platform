// scripts/verify/run-all.mjs
// 聚合执行所有 CRITICAL 验证脚本，输出汇总 markdown 报告
// 用法：node scripts/verify/run-all.mjs [--pattern=C-*] [--skip-frontend]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT_ROOT = resolve(process.cwd());
const VERIFY_DIR = join(PROJECT_ROOT, 'scripts', 'verify');
const OUTPUT_DIR = join(PROJECT_ROOT, 'docs', 'audit', 'verify');

// 解析参数
const args = process.argv.slice(2);
const patternArg = args.find((a) => a.startsWith('--pattern='))?.split('=')[1];
const skipFrontend = args.includes('--skip-frontend');
const skipDb = args.includes('--skip-db');
const onlyArg = args.find((a) => a.startsWith('--only='))?.split('=')[1];

// 收集所有验证脚本（C-XXX 开头的 .mjs 文件，排除 _lib / run-all）
const allScripts = readdirSync(VERIFY_DIR)
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'run-all.mjs')
  .sort();

let scripts = allScripts;
if (onlyArg) {
  scripts = allScripts.filter((f) => f.startsWith(onlyArg));
} else if (patternArg) {
  const rx = new RegExp(patternArg);
  scripts = allScripts.filter((f) => rx.test(f));
}
if (skipFrontend) {
  scripts = scripts.filter((f) => f !== 'verify-frontend.mjs');
}
if (skipDb) {
  scripts = scripts.filter((f) => f !== 'verify-data.mjs' && f !== 'verify-backend.mjs');
}

console.log(`\n=== Critical Fixes Verification Runner ===`);
console.log(`Found ${scripts.length} verification script(s) to run`);
console.log(`Output dir: ${OUTPUT_DIR}\n`);

if (scripts.length === 0) {
  console.log('No verification scripts found. Run this after creating C-XXX-*.mjs scripts.');
  process.exit(0);
}

// 依次执行每个脚本
const results = [];
for (const script of scripts) {
  console.log(`\n--- Running ${script} ---`);
  const start = Date.now();
  const r = spawnSync('node', [join(VERIFY_DIR, script)], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 180000,
  });
  const elapsed = Date.now() - start;
  const exitCode = r.status ?? -1;
  const stdout = (r.stdout ?? '').trim();
  const stderr = (r.stderr ?? '').trim();
  if (stdout) console.log(stdout);
  if (stderr) console.error('STDERR:', stderr);
  console.log(`--- ${script} exited code=${exitCode} in ${elapsed}ms ---`);
  results.push({
    script,
    exitCode,
    elapsed,
    stdout: stdout.slice(-500),
    stderr: stderr.slice(-500),
  });
}

// 收集每个 issue 的 JSON 报告
const issueResults = [];
if (existsSync(OUTPUT_DIR)) {
  for (const f of readdirSync(OUTPUT_DIR)) {
    if (!f.endsWith('-reverify.json')) continue;
    try {
      const data = JSON.parse(readFileSync(join(OUTPUT_DIR, f), 'utf-8'));
      if (data.results && typeof data.results === 'object' && !Array.isArray(data.results)) {
        for (const [subId, sub] of Object.entries(data.results)) {
          const normalizedId = /^(C|H)\d+$/.test(subId)
            ? subId.replace(/^(C|H)(\d+)$/, '$1-$2')
            : subId;
          issueResults.push({ issueId: normalizedId, ...sub });
        }
      } else if (data.issueId) {
        issueResults.push(data);
      }
    } catch {
      /* ignore */
    }
  }
}

// 生成 SUMMARY.md
const summaryPath = join(OUTPUT_DIR, 'SUMMARY.md');
const passCount = issueResults.filter((r) => r.status === 'PASS').length;
const failCount = issueResults.filter((r) => r.status === 'FAIL').length;
const skipCount = issueResults.filter((r) => r.status === 'SKIP').length;
const reviewCount = issueResults.filter((r) => r.status === 'NEEDS_MANUAL_REVIEW').length;

let md = `# CRITICAL 修复验证汇总报告\n\n`;
md += `**生成时间**：${new Date().toISOString()}\n\n`;
md += `**汇总**：✓ PASS=${passCount}  ✗ FAIL=${failCount}  ○ SKIP=${skipCount}  ? REVIEW=${reviewCount}  (总计 ${issueResults.length})\n\n`;
md += `## 详细结果\n\n`;
md += `| Issue ID | 状态 | 摘要 | 验证脚本 |\n`;
md += `|----------|------|------|----------|\n`;
for (const r of issueResults.sort((a, b) => a.issueId.localeCompare(b.issueId))) {
  const icon =
    r.status === 'PASS'
      ? '✓ PASS'
      : r.status === 'SKIP'
        ? '○ SKIP'
        : r.status === 'NEEDS_MANUAL_REVIEW'
          ? '? REVIEW'
          : '✗ FAIL';
  const script = results.find((x) => x.script.includes(r.issueId))?.script ?? '-';
  const summary = (r.summary ?? '').replace(/\|/g, '\\|').slice(0, 200);
  md += `| ${r.issueId} | ${icon} | ${summary} | ${script} |\n`;
}

md += `\n## 脚本执行情况\n\n`;
md += `| 脚本 | 退出码 | 耗时(ms) |\n`;
md += `|------|--------|----------|\n`;
for (const r of results) {
  md += `| ${r.script} | ${r.exitCode} | ${r.elapsed} |\n`;
}

writeFileSync(summaryPath, md);
console.log(`\n=== Summary written to ${summaryPath} ===`);
console.log(
  `PASS=${passCount} FAIL=${failCount} SKIP=${skipCount} REVIEW=${reviewCount} / total=${issueResults.length}`,
);

// 退出码：任何 FAIL 或子脚本非零退出都返回 1（子脚本崩溃/未写 FAIL JSON 也阻断门禁）
process.exit(failCount > 0 || results.some((r) => r.exitCode !== 0) ? 1 : 0);
