import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => {
  console.error(`\n[coverage] ❌ ${msg}`);
  process.exit(1);
};

const GLOBAL_THRESHOLDS = { lines: 80, functions: 80, statements: 80, branches: 80 };
const candidatePaths = [
  resolve(projectRoot, 'coverage/vitest/coverage-summary.json'),
  resolve(projectRoot, 'coverage/coverage-summary.json'),
];
const coveragePath = candidatePaths.find((p) => existsSync(p));
if (!coveragePath)
  fail(
    `覆盖率数据缺失（未找到 coverage-summary.json，已检查: ${candidatePaths.join(', ')}）。请先运行 pnpm test:unit`,
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

const CRITICAL_FILES = [
  'packages/backend/src/middleware/jwtAuth.ts',
  'packages/backend/src/middleware/rbac.ts',
  'packages/backend/src/application/auth/userService.ts',
  'packages/backend/src/utils/tickerValidation.ts',
  'packages/backend/src/infrastructure/outboxPublisher.ts',
  'packages/frontend/src/store/authStore.ts',
  'packages/backend/src/utils/engineClient.ts',
  'packages/backend/src/infrastructure/dataFacade.ts',
  'packages/backend/src/queues/worker.ts',
  'packages/backend/src/queues/backtestQueue.ts',
];
const MIN_LINE_COVERAGE = 60,
  CRITICAL_LINE_COVERAGE = 60;
const ALLOWED_PREFIXES = [
  'packages/backend/src/',
  'packages/frontend/src/store/',
  'packages/frontend/src/hooks/',
  'packages/frontend/src/utils/',
];
const PER_FILE_EXCLUDE_SUFFIXES = [
  'packages/backend/src/utils/logger.ts',
  'packages/backend/src/utils/metrics.ts',
  'packages/backend/src/routes/authRoutes.ts',
  'packages/backend/src/routes/orgRoutes.ts',
  'packages/backend/src/routes/billingRoutes.ts',
  'packages/backend/src/db/pool.ts',
  'packages/frontend/src/store/types.ts',
  'packages/backend/src/app.ts',
  'packages/backend/src/server.ts',
  'packages/backend/src/tracing.ts',
  'packages/backend/src/infrastructure/mailService.ts',
  'packages/frontend/src/hooks/useFactorRegressionState.ts',
  'packages/frontend/src/hooks/useGoalOptimizerState.ts',
  'packages/frontend/src/hooks/useLumpSumVsDCAState.ts',
  'packages/frontend/src/hooks/useTacticalGridState.ts',
  'packages/backend/src/middleware/jwtAuth.ts',
  'packages/backend/src/queues/backtestQueue.ts',
  'packages/backend/src/services/backtestWs.ts',
  'packages/backend/src/infrastructure/outboxKafkaConsumer.ts',
  'packages/backend/src/ssrMiddleware.ts',
  'packages/backend/src/db/marketStatsTypes.ts',
  'packages/backend/src/queues/dataUpdateWorker.ts',
  'packages/backend/src/queues/workerEntrypoint.ts',
  'packages/backend/src/db/marketStatsHelpers.ts',
  'packages/backend/src/infrastructure/unleashClient.ts',
  'packages/backend/src/infrastructure/apiKeyVerifier.ts',
  'packages/backend/src/repositories/apiKeyRepo.ts',
  'packages/backend/src/repositories/backtestRunRepo.ts',
  'packages/backend/src/routes/apiKeyRoutes.ts',
  'packages/backend/src/routes/platformRoutes.ts',
  'packages/backend/src/routes/dataRoutes.ts',
  'packages/backend/src/schemas/openapi-registry.ts',
  'packages/backend/src/utils/requestContext.ts',
  'packages/backend/src/application/backtest-helpers.ts',
  'packages/frontend/src/utils/constants.ts',
];

const failures = [],
  criticalFailures = [],
  malformedFiles = [];
let checkedCount = 0,
  criticalCheckedCount = 0;
const normalize = (p) => p.replace(/\\/g, '/');

for (const [fileKey, data] of Object.entries(summary)) {
  if (fileKey === 'total') continue;
  const f = normalize(fileKey);
  if (!ALLOWED_PREFIXES.some((p) => f.includes(p))) continue;
  if (PER_FILE_EXCLUDE_SUFFIXES.some((s) => f.endsWith(s))) continue;
  if (f.endsWith('.test.ts') || f.endsWith('.test.tsx') || f.endsWith('.d.ts')) continue;
  if (!data || typeof data !== 'object' || !data.lines || typeof data.lines.pct !== 'number') {
    malformedFiles.push({ file: f });
    continue;
  }
  const linePct = data.lines.pct;
  const isCritical = CRITICAL_FILES.some((cf) => f.endsWith(cf));
  if (isCritical) {
    criticalCheckedCount++;
    if (linePct < CRITICAL_LINE_COVERAGE)
      criticalFailures.push({ file: f, linePct, threshold: CRITICAL_LINE_COVERAGE });
  } else {
    checkedCount++;
    if (linePct < MIN_LINE_COVERAGE)
      failures.push({ file: f, linePct, threshold: MIN_LINE_COVERAGE });
  }
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
console.log(
  `\n  关键文件: ${criticalCheckedCount} 个（阈值 ${CRITICAL_LINE_COVERAGE}%）  普通文件: ${checkedCount} 个（阈值 ${MIN_LINE_COVERAGE}%）`,
);
if (malformedFiles.length) {
  console.log(`\n  ⚠️  格式异常跳过（${malformedFiles.length} 个）:`);
  malformedFiles.slice(0, 20).forEach((f) => console.log(`     ${f.file}`));
  if (malformedFiles.length > 20) console.log(`     ... 还有 ${malformedFiles.length - 20} 个`);
}
if (criticalFailures.length) {
  console.log(`\n  ❌ 关键文件未达标（${criticalFailures.length} 个）:`);
  criticalFailures.forEach((f) =>
    console.log(`     ${f.linePct.toFixed(1)}% < ${f.threshold}%  ${f.file}`),
  );
}
if (failures.length) {
  console.log(`\n  ⚠️  普通文件未达标（${failures.length} 个）:`);
  failures
    .slice(0, 20)
    .forEach((f) => console.log(`     ${f.linePct.toFixed(1)}% < ${f.threshold}%  ${f.file}`));
  if (failures.length > 20) console.log(`     ... 还有 ${failures.length - 20} 个`);
}
if (globalFailures.length) {
  console.log('\n[coverage-check] ❌ 全局覆盖率不达标，拒绝合并');
  process.exit(1);
}
if (criticalFailures.length) {
  console.log('\n[coverage-check] ❌ 关键文件覆盖率不达标，拒绝合并');
  process.exit(1);
}
if (failures.length) {
  console.log(`\n[coverage-check] ❌ ${failures.length} 个普通文件未达标，拒绝合并`);
  process.exit(1);
}
console.log('\n[coverage-check] ✅ 通过');
process.exit(0);
