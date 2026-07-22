// Per-file 覆盖率门槛检查（Task 19.2 / 对抗性测试门控）
//
// 全局：vitest thresholds ≥80%（lines/functions/statements） / ≥70%（branches）
// 普通文件：行覆盖率 ≥75%
// 关键文件（认证/金融/安全）：行覆盖率 ≥90%
//
// 分层门控：只检查 backend 全量 + frontend store/hooks/utils
// 纯 UI 页面/组件（pages/components）由 E2E 覆盖，不强制单测

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const candidatePaths = [
  resolve(projectRoot, 'coverage/vitest/coverage-summary.json'),
  resolve(projectRoot, 'coverage/coverage-summary.json'),
];

const coveragePath = candidatePaths.find((p) => existsSync(p));

if (!coveragePath) {
  console.error('\n[coverage-check] 错误：未找到 coverage-summary.json');
  console.error('  请先运行：npm run test:coverage');
  console.error('  注意：vitest workspace 模式下 json-summary reporter 可能不生成，');
  console.error('  请用 npx vitest run --coverage --reporter=json-summary 单独生成');
  process.exit(1);
}

let summary;
try {
  summary = JSON.parse(readFileSync(coveragePath, 'utf8'));
} catch (err) {
  console.error(`\n[coverage-check] 错误：解析失败：${err.message}`);
  process.exit(1);
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
  'packages/backend/src/middleware/auditLog.ts',
  'packages/backend/src/middleware/idempotency.ts',
  'packages/backend/src/infrastructure/outboxWriter.ts',
  'packages/backend/src/infrastructure/outboxPublisher.ts',
  'packages/backend/src/utils/numericRange.ts',
  'packages/backend/src/db/tenant.ts',
  'packages/frontend/src/store/authStore.ts',
  'packages/frontend/src/utils/authTokens.ts',
  // RO-048: 关键业务逻辑文件从 coverage exclude 移除后纳入 90% 门控
  'packages/backend/src/utils/engineClient.ts',
  'packages/backend/src/infrastructure/dataFacade.ts',
  'packages/backend/src/queues/worker.ts',
  'packages/backend/src/queues/jobIdempotency.ts',
  'packages/backend/src/queues/backtestQueue.ts',
];

const MIN_LINE_COVERAGE = 75;
const CRITICAL_LINE_COVERAGE = 90;
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
/** 纯类型/barrel/基础设施/外部服务依赖（与 vitest.workspace.ts 的 coverage.exclude 同步） */
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
  'packages/backend/src/routes/tacticalRoutes.ts',
  'packages/backend/src/db/import.ts',
  'packages/backend/src/db/pool.ts',
  'packages/backend/src/db/importBulk.ts',
  'packages/backend/src/types/pg-copy-streamams.d.ts',
  'packages/frontend/src/store/index.ts',
  'packages/frontend/src/store/types.ts',
  'packages/backend/src/app.ts',
  // 启动入口/OpenTelemetry 配置/barrel/re-export（不适合单测）
  'packages/backend/src/server.ts',
  'packages/backend/src/tracing.ts',
  'packages/backend/src/domain/events/index.ts',
  // infrastructure/mailService.ts 是外部 SMTP 服务封装
  'packages/backend/src/infrastructure/mailService.ts',
  // 页面状态 hooks（强依赖页面组件上下文，由 E2E 覆盖）
  'packages/frontend/src/hooks/useAnalysisPageState.ts',
  'packages/frontend/src/hooks/useComputeTool.ts',
  'packages/frontend/src/hooks/useDataEngineState.ts',
  'packages/frontend/src/hooks/useFactorRegressionState.ts',
  'packages/frontend/src/hooks/useGoalOptimizerState.ts',
  'packages/frontend/src/hooks/useListState.ts',
  'packages/frontend/src/hooks/useLumpSumVsDCAState.ts',
  'packages/frontend/src/hooks/useTacticalGridState.ts',
];

const failures = [];
const criticalFailures = [];
let checkedCount = 0;
let criticalCheckedCount = 0;

const normalize = (p) => p.replace(/\\/g, '/');

for (const [fileKey, data] of Object.entries(summary)) {
  const normalizedFile = normalize(fileKey);

  // 分层门控：只检查 ALLOWED_PREFIXES 中的文件
  if (!ALLOWED_PREFIXES.some((pfx) => normalizedFile.includes(pfx))) continue;

  // 跳过排除文件
  if (PER_FILE_EXCLUDE_SUFFIXES.some((sfx) => normalizedFile.endsWith(sfx))) continue;

  // 跳过测试文件
  if (normalizedFile.endsWith('.test.ts') || normalizedFile.endsWith('.test.tsx')) continue;
  if (normalizedFile.endsWith('.d.ts')) continue;

  const linePct = data.lines?.pct ?? 0;

  // 判断是否为关键文件
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

// 汇总
console.log('\n[coverage-check] Per-file 覆盖率检查');
console.log(`  关键文件检查：${criticalCheckedCount} 个（阈值 ${CRITICAL_LINE_COVERAGE}%）`);
console.log(`  普通文件检查：${checkedCount} 个（阈值 ${MIN_LINE_COVERAGE}%）`);

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
