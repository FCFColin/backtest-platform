// 临时脚本：列出 0% 覆盖率的文件（用于决策 exclude vs 补测试）
import { readFileSync } from 'fs';

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));

const allowed = [
  'packages/backend/src/',
  'packages/frontend/src/store/',
  'packages/frontend/src/hooks/',
  'packages/frontend/src/utils/',
];
const exclude = [
  'cqrs.ts', 'timeout.ts', 'tracePropagation.ts', 'logger.ts', 'metrics.ts',
  'mailService.ts', 'backtest-completed.ts', 'rebalance-triggered.ts',
  'authRoutes.ts', 'orgRoutes.ts', 'billingRoutes.ts', 'tacticalRoutes.ts',
  'import.ts', 'pool.ts', 'importBulk.ts', 'pg-copy-streamams.d.ts',
  'store/index.ts', 'store/types.ts', 'app.ts',
];

const zero = [];
const low = [];
for (const [k, v] of Object.entries(summary)) {
  const n = k.replace(/\\/g, '/');
  if (!allowed.some((p) => n.includes(p))) continue;
  if (exclude.some((e) => n.endsWith(e))) continue;
  if (n.endsWith('.test.ts') || n.endsWith('.test.tsx') || n.endsWith('.d.ts')) continue;
  const pct = v.lines?.pct ?? 0;
  const idx = n.indexOf('src/');
  const rel = n.substring(idx).replace('src/', '');
  if (pct === 0) zero.push(rel);
  else if (pct < 75) low.push(`${pct.toFixed(1)}% ${rel}`);
}

console.log('=== 0% 覆盖率文件（候选 exclude 或补测试）===');
zero.forEach((f) => console.log(`  ${f}`));
console.log(`\n总计: ${zero.length} 个 0% 文件`);

console.log('\n=== 低覆盖率文件（< 75%）===');
low.forEach((f) => console.log(`  ${f}`));
console.log(`\n总计: ${low.length} 个低覆盖率文件`);
