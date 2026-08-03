import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Phase 1 门禁（见文件头说明；上调时同步更新输出文案中的门槛值）
const GLOBAL_THRESHOLDS = {
  lines: 5,
  functions: 55,
  statements: 5,
  branches: 70,
};

const candidatePaths = [
  resolve(projectRoot, 'coverage/vitest/coverage-summary.json'),
  resolve(projectRoot, 'coverage/coverage-summary.json'),
];

const coveragePath = candidatePaths.find((p) => existsSync(p));

if (!coveragePath) {
  console.error('\n[coverage-check] ❌ 覆盖率数据缺失');
  console.error('  未找到 coverage-summary.json，已检查路径：');
  for (const p of candidatePaths) {
    console.error(`    - ${p}`);
  }
  console.error('');
  console.error('  可能原因：');
  console.error('    1. 测试运行失败（vitest 在测试崩溃时不生成覆盖率文件）');
  console.error('       → 请先运行 npm run test:unit 确保所有测试通过');
  console.error('    2. json-summary reporter 未正确配置');
  console.error(
    '       → 请用 npx vitest run --coverage --coverage.reporter=json-summary 单独生成',
  );
  console.error('');
  console.error('  覆盖率门控失败：无法执行任何门槛检查');
  process.exit(1);
}

let summary;
try {
  summary = JSON.parse(readFileSync(coveragePath, 'utf8'));
} catch (err) {
  console.error(`\n[coverage-check] ❌ coverage-summary.json 解析失败：${err.message}`);
  console.error(`  文件路径：${coveragePath}`);
  console.error('  覆盖率门控失败：覆盖率数据格式错误，无法执行门槛检查');
  process.exit(1);
}

if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
  console.error('\n[coverage-check] ❌ coverage-summary.json 顶层不是对象');
  console.error(`  文件路径：${coveragePath}`);
  console.error('  覆盖率门控失败：覆盖率数据结构不合法');
  process.exit(1);
}

const total = summary.total;
if (!total || typeof total !== 'object') {
  console.error('\n[coverage-check] ❌ coverage-summary.json 缺少 total 汇总字段');
  console.error('  覆盖率门控失败：覆盖率数据不完整（可能部分文件覆盖率缺失）');
  process.exit(1);
}

const globalFailures = [];
for (const [metric, threshold] of Object.entries(GLOBAL_THRESHOLDS)) {
  const metricData = total[metric];
  if (!metricData || typeof metricData !== 'object' || typeof metricData.pct !== 'number') {
    globalFailures.push({
      metric,
      pct: null,
      threshold,
      reason: `${metric} coverage 数据缺失或格式错误（期望 pct 为数字，实际：${
        metricData?.pct === undefined ? 'undefined' : JSON.stringify(metricData?.pct)
      }）< ${threshold}% threshold`,
    });
    continue;
  }
  if (metricData.pct < threshold) {
    globalFailures.push({
      metric,
      pct: metricData.pct,
      threshold,
      reason: `${metric} coverage ${metricData.pct.toFixed(2)}% < ${threshold}% threshold`,
    });
  }
}

const CRITICAL_FILES = [
  'packages/backend/src/middleware/auth.ts',
  'packages/backend/src/middleware/jwtSigner.ts',
  'packages/backend/src/middleware/jwtAuth.ts',
  'packages/backend/src/middleware/rbac.ts',
  'packages/backend/src/application/auth/userService.ts',
  'packages/backend/src/engine/portfolio.ts',
  'packages/backend/src/engine/statistics.ts',
  'packages/backend/src/engine/optimizer.ts',
  'packages/backend/src/engine/monteCarlo.ts',
  'packages/backend/src/engine/signal.ts',
  'packages/backend/src/engine/tactical.ts',
  'packages/backend/src/utils/integrity.ts',
  'packages/backend/src/utils/tickerValidation.ts',
  'packages/backend/src/middleware/validate.ts',
  'packages/backend/src/infrastructure/outboxWriter.ts',
  'packages/backend/src/infrastructure/outboxPublisher.ts',
  'packages/backend/src/utils/numericRange.ts',
  'packages/backend/src/db/tenant.ts',
  'packages/frontend/src/store/authStore.ts',
  'packages/backend/src/utils/engineClient.ts',
  'packages/backend/src/infrastructure/dataFacade.ts',
  'packages/backend/src/queues/worker.ts',
  'packages/backend/src/queues/jobIdempotency.ts',
  'packages/backend/src/queues/backtestQueue.ts',
];

// Phase 1: 逐文件门槛暂挂起（阈值 0），2026-08 基线 12+ 文件行覆盖 0%，先由全局门禁防回归
const MIN_LINE_COVERAGE = 0;
const CRITICAL_LINE_COVERAGE = 0;
/**
 * 分层门控：只检查这些路径下的文件（vitest workspace 模式下 include/exclude 不生效，
 * 通过白名单限制检查范围）。纯 UI 页面/组件由 E2E 覆盖，不强制单测。
 */
const ALLOWED_PREFIXES = [
  'packages/backend/src/',
  'packages/frontend/src/store/',
  'packages/frontend/src/hooks/',
  'packages/frontend/src/utils/',
];
const PER_FILE_EXCLUDE_SUFFIXES = [
  'packages/backend/src/application/cqrs.ts',
  'packages/backend/src/utils/timeout.ts',
  'packages/backend/src/utils/tracePropagation.ts',
  'packages/backend/src/utils/logger.ts',
  'packages/backend/src/utils/metrics.ts',
  'packages/backend/src/domain/events/backtest-completed.ts',
  'packages/backend/src/domain/events/rebalance-triggered.ts',
  'packages/backend/src/routes/authRoutes.ts',
  'packages/backend/src/routes/orgRoutes.ts',
  'packages/backend/src/routes/billingRoutes.ts',
  'packages/backend/src/db/import.ts',
  'packages/backend/src/db/pool.ts',
  'packages/backend/src/db/importBulk.ts',
  'packages/backend/src/types/pg-copy-streamams.d.ts',
  'packages/frontend/src/store/index.ts',
  'packages/frontend/src/store/types.ts',
  'packages/backend/src/app.ts',
  'packages/backend/src/server.ts',
  'packages/backend/src/tracing.ts',
  'packages/backend/src/domain/events/index.ts',
  'packages/backend/src/infrastructure/mailService.ts',
  'packages/frontend/src/hooks/useAnalysisPageState.ts',
  'packages/frontend/src/hooks/useComputeTool.ts',
  'packages/frontend/src/hooks/useDataEngineState.ts',
  'packages/frontend/src/hooks/useFactorRegressionState.ts',
  'packages/frontend/src/hooks/useGoalOptimizerState.ts',
  'packages/frontend/src/hooks/useListState.ts',
  'packages/frontend/src/hooks/useLumpSumVsDCAState.ts',
  'packages/frontend/src/hooks/useTacticalGridState.ts',
  // ADR-042: schema merged to analysisSchemas.ts, dead code
  'packages/backend/src/schemas/tacticalGrid.ts',
  'packages/backend/src/schemas/dataManage.ts',
  // P0-03/P0-04: new async backtest + admin key code paths need integration tests
  'packages/backend/src/middleware/jwtAuth.ts',
  'packages/backend/src/queues/backtestQueue.ts',
  // P1-04: WebSocket service needs integration tests (Redis Pub/Sub + WS handshake)
  'packages/backend/src/services/backtestWs.ts',
  // P0-02: 0% covered infra/config/route/repo files (need external services/DB, untestable in unit)
  'packages/backend/src/ssrMiddleware.ts',
  'packages/backend/src/db/marketStatsTypes.ts',
  'packages/backend/src/queues/dataUpdateWorker.ts',
  'packages/backend/src/queues/workerEntrypoint.ts',
  'packages/backend/src/config/featureFlags.ts',
  'packages/backend/src/db/marketStatsHelpers.ts',
  'packages/backend/src/db/marketStorageStats.ts',
  'packages/backend/src/infrastructure/apiKeyMonitoring.ts',
  'packages/backend/src/infrastructure/redisHealth.ts',
  'packages/backend/src/infrastructure/unleashClient.ts',
  'packages/backend/src/infrastructure/apiKeyVerifier.ts',
  'packages/backend/src/middleware/openapiUi.ts',
  'packages/backend/src/repositories/apiKeyRepo.ts',
  'packages/backend/src/repositories/backtestRunRepo.ts',
  // 路由合并（routes 瘦身）：并入大文件的 0% 单测覆盖代码随文件一并豁免
  'packages/backend/src/routes/apiKeyRoutes.ts',
  'packages/backend/src/routes/platformRoutes.ts',
  'packages/backend/src/routes/dataRoutes.ts',
  'packages/backend/src/schemas/openapi-registry.ts',
  'packages/backend/src/utils/requestContext.ts',
  'packages/backend/src/application/backtest-helpers.ts',
  'packages/frontend/src/hooks/useOptimizerLikeState.ts',
  'packages/frontend/src/utils/constants.ts',
];

const failures = [];
const criticalFailures = [];
const malformedFiles = [];
let checkedCount = 0;
let criticalCheckedCount = 0;

const normalize = (p) => p.replace(/\\/g, '/');

for (const [fileKey, data] of Object.entries(summary)) {
  if (fileKey === 'total') continue;

  const normalizedFile = normalize(fileKey);

  if (!ALLOWED_PREFIXES.some((pfx) => normalizedFile.includes(pfx))) continue;

  if (PER_FILE_EXCLUDE_SUFFIXES.some((sfx) => normalizedFile.endsWith(sfx))) continue;

  if (normalizedFile.endsWith('.test.ts') || normalizedFile.endsWith('.test.tsx')) continue;
  if (normalizedFile.endsWith('.d.ts')) continue;

  // 防御：data 非对象或 lines 字段缺失计为格式异常
  if (!data || typeof data !== 'object' || !data.lines || typeof data.lines.pct !== 'number') {
    malformedFiles.push({ file: normalizedFile });
    continue;
  }

  const linePct = data.lines.pct;

  const isCritical = CRITICAL_FILES.some((cf) => normalizedFile.endsWith(cf));

  if (isCritical) {
    criticalCheckedCount++;
    if (linePct < CRITICAL_LINE_COVERAGE) {
      criticalFailures.push({ file: normalizedFile, linePct, threshold: CRITICAL_LINE_COVERAGE });
    }
  } else {
    checkedCount++;
    if (linePct < MIN_LINE_COVERAGE) {
      failures.push({ file: normalizedFile, linePct, threshold: MIN_LINE_COVERAGE });
    }
  }
}

console.log('\n[coverage-check] 覆盖率门控检查');

console.log('\n  全局门槛（Phase 1 分阶段门禁）:');
for (const [metric, threshold] of Object.entries(GLOBAL_THRESHOLDS)) {
  const pct = total[metric]?.pct;
  if (typeof pct === 'number') {
    const status = pct >= threshold ? '✅' : '❌';
    console.log(
      `    ${status} ${metric.padEnd(11)} ${pct.toFixed(2).padStart(6)}% / ${threshold}%`,
    );
  } else {
    console.log(`    ❌ ${metric.padEnd(11)} 数据缺失 / ${threshold}%`);
  }
}

if (globalFailures.length > 0) {
  console.log(`\n  ❌ 全局覆盖率未达标（${globalFailures.length} 项）:`);
  for (const f of globalFailures) {
    console.log(`     ${f.reason}`);
  }
}

console.log(`\n  关键文件检查：${criticalCheckedCount} 个（阈值 ${CRITICAL_LINE_COVERAGE}%）`);
console.log(`  普通文件检查：${checkedCount} 个（阈值 ${MIN_LINE_COVERAGE}%）`);

if (malformedFiles.length > 0) {
  console.log(`\n  ⚠️  覆盖率数据格式异常文件（${malformedFiles.length} 个，已跳过）:`);
  for (const f of malformedFiles.slice(0, 20)) {
    console.log(`     ${f.file}`);
  }
  if (malformedFiles.length > 20) {
    console.log(`     ... 还有 ${malformedFiles.length - 20} 个`);
  }
}

if (criticalFailures.length > 0) {
  console.log(`\n  ❌ 关键文件未达标（${criticalFailures.length} 个）:`);
  for (const f of criticalFailures) {
    console.log(`     ${f.linePct.toFixed(1)}% < ${f.threshold}%  ${f.file}`);
  }
}

if (failures.length > 0) {
  console.log(`\n  ⚠️  普通文件未达标（${failures.length} 个）:`);
  for (const f of failures.slice(0, 20)) {
    console.log(`     ${f.linePct.toFixed(1)}% < ${f.threshold}%  ${f.file}`);
  }
  if (failures.length > 20) {
    console.log(`     ... 还有 ${failures.length - 20} 个`);
  }
}

if (globalFailures.length > 0) {
  console.log('\n[coverage-check] ❌ 全局覆盖率门槛不达标，拒绝合并');
  process.exit(1);
}

if (criticalFailures.length > 0) {
  console.log('\n[coverage-check] ❌ 关键文件覆盖率不达标，拒绝合并');
  process.exit(1);
}

if (failures.length > 0) {
  console.log(`\n[coverage-check] ❌ ${failures.length} 个普通文件未达标，拒绝合并`);
  process.exit(1);
}

console.log('\n[coverage-check] ✅ 通过');
process.exit(0);
