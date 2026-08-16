import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => {
  console.error(`\n[coverage] ❌ ${msg}`);
  process.exit(1);
};

const GLOBAL_THRESHOLDS = { lines: 80, functions: 80, statements: 80, branches: 80 };
// vite.config.ts coverage.reportsDirectory 固定为 coverage/vitest（单一权威路径）
const coveragePath = resolve(projectRoot, 'coverage/vitest/coverage-summary.json');
if (!existsSync(coveragePath))
  fail(
    `覆盖率数据缺失（未找到 coverage-summary.json，已检查: ${coveragePath}）。请先运行 pnpm test:unit`,
  );

let summary;
try {
  summary = JSON.parse(readFileSync(coveragePath, 'utf8'));
} catch (e) {
  fail(`coverage-summary.json 解析失败: ${e.message} (${coveragePath})`);
}
if (!summary || typeof summary !== 'object' || Array.isArray(summary))
  fail('coverage-summary.json 顶层不是对象');
const total = summary.total;
if (!total || typeof total !== 'object') fail('coverage-summary.json 缺少 total 汇总字段');

const globalFailures = [];
for (const [metric, threshold] of Object.entries(GLOBAL_THRESHOLDS)) {
  const pct = total[metric]?.pct;
  if (typeof pct !== 'number') {
    globalFailures.push({
      metric,
      pct: null,
      threshold,
      reason: `${metric} 数据缺失或格式错误 < ${threshold}%`,
    });
  } else if (pct < threshold) {
    globalFailures.push({
      metric,
      pct,
      threshold,
      reason: `${metric} ${pct.toFixed(2)}% < ${threshold}%`,
    });
  }
}

const MIN_LINE_COVERAGE = 60;
const ALLOWED_PREFIXES = [
  'packages/backend/src/',
  'packages/frontend/src/store/',
  'packages/frontend/src/hooks/',
  'packages/frontend/src/utils/',
];
// 仅豁免"已计入全局覆盖率但每文件行覆盖不达标"的文件。
// 完全不参与覆盖率的文件以 vite.config.ts coverage.exclude 为单一权威源（不再重复列出）。
// 豁免分组说明（治理期限：2026-Q4 复核，每组须保留对应集成/契约/混沌测试兜底）：
//   ① 路由绑定与入口（薄胶水层）：依赖契约/集成测试（api-implementation.contract.test.ts 覆盖全部路由挂载）
//   ② 真实外部依赖面（PG/Redis/Kafka/BullMQ）：由 testcontainers 集成与 chaos 实验兜底，单测 mock 无意义
//   ③ 前端状态 hooks/常量：由 e2e（store 全链路）兜底
const PER_FILE_EXCLUDE_SUFFIXES = [
  // ① 路由绑定与入口
  'packages/backend/src/routes/authRoutes.ts',
  'packages/backend/src/routes/orgRoutes.ts',
  'packages/backend/src/routes/billingRoutes.ts',
  'packages/backend/src/routes/apiKeyRoutes.ts',
  'packages/backend/src/routes/platformRoutes.ts',
  'packages/backend/src/routes/dataRoutes.ts',
  'packages/backend/src/schemas/openapi-registry.ts',
  'packages/backend/src/server.ts',
  'packages/backend/src/tracing.ts',
  // ② 真实外部依赖面
  'packages/backend/src/db/pool.ts',
  'packages/backend/src/middleware/jwtAuth.ts',
  'packages/backend/src/queues/backtestQueue.ts',
  'packages/backend/src/services/backtestWs.ts',
  'packages/backend/src/infrastructure/outboxKafkaConsumer.ts',
  'packages/backend/src/infrastructure/apiKeyVerifier.ts',
  'packages/backend/src/repositories/apiKeyRepo.ts',
  'packages/backend/src/repositories/backtestRunRepo.ts',
  'packages/backend/src/db/marketStatsHelpers.ts',
  'packages/backend/src/utils/requestContext.ts',
  'packages/backend/src/application/backtest-helpers.ts',
  // ③ 前端状态 hooks/常量
  'packages/frontend/src/hooks/useFactorRegressionState.ts',
  'packages/frontend/src/hooks/useGoalOptimizerState.ts',
  'packages/frontend/src/hooks/useLumpSumVsDCAState.ts',
  'packages/frontend/src/hooks/useTacticalGridState.ts',
  'packages/frontend/src/utils/constants.ts',
];

const failures = [];
let checkedCount = 0;
const normalize = (p) => p.replace(/\\/g, '/');

for (const [fileKey, data] of Object.entries(summary)) {
  if (fileKey === 'total') continue;
  const f = normalize(fileKey);
  if (!ALLOWED_PREFIXES.some((p) => f.startsWith(p))) continue;
  if (PER_FILE_EXCLUDE_SUFFIXES.some((s) => f.endsWith(s))) continue;
  if (f.endsWith('.test.ts') || f.endsWith('.test.tsx') || f.endsWith('.d.ts')) continue;
  if (typeof data?.lines?.pct !== 'number') {
    console.warn(`[coverage] 跳过无覆盖率数据的文件: ${f}`);
    continue;
  }
  checkedCount++;
  if (data.lines.pct < MIN_LINE_COVERAGE)
    failures.push({ file: f, linePct: data.lines.pct, threshold: MIN_LINE_COVERAGE });
}

console.log('\n[coverage-check] 覆盖率门控检查');
console.log('\n  全局门槛:');
for (const [metric, threshold] of Object.entries(GLOBAL_THRESHOLDS)) {
  const pct = total[metric]?.pct;
  console.log(
    `    ${typeof pct === 'number' && pct >= threshold ? '✅' : '❌'} ${metric.padEnd(11)} ${typeof pct === 'number' ? pct.toFixed(2).padStart(6) : '  N/A'}% / ${threshold}%`,
  );
}
if (globalFailures.length) {
  console.log(`\n  ❌ 全局未达标（${globalFailures.length} 项）:`);
  globalFailures.forEach((f) => console.log(`     ${f.reason}`));
}
console.log(`\n  检查文件: ${checkedCount} 个（每文件行覆盖率阈值 ${MIN_LINE_COVERAGE}%）`);
if (failures.length) {
  console.log(`\n  ⚠️  未达标文件（${failures.length} 个）:`);
  failures
    .slice(0, 20)
    .forEach((f) => console.log(`     ${f.linePct.toFixed(1)}% < ${f.threshold}%  ${f.file}`));
  if (failures.length > 20) console.log(`     ... 还有 ${failures.length - 20} 个`);
}
if (globalFailures.length) {
  console.log('\n[coverage-check] ❌ 全局覆盖率不达标，拒绝合并');
  process.exit(1);
}
if (failures.length) {
  console.log(`\n[coverage-check] ❌ ${failures.length} 个文件未达标，拒绝合并`);
  process.exit(1);
}
console.log('\n[coverage-check] ✅ 通过');
process.exit(0);
