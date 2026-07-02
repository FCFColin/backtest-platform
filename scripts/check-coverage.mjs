// Per-file 覆盖率门槛检查（Task 19.2 / 对抗性测试门控）
//
// 全局：vitest thresholds ≥85%
// 普通文件：行覆盖率 ≥60%
// 关键文件（认证/金融/安全）：行覆盖率 ≥90%
// 任一纳入统计的文件不得低于 60%

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
  'api/middleware/auth.ts',
  'api/middleware/jwtAuth.ts',
  'api/middleware/rbac.ts',
  'api/services/userService.ts',
  'api/engine/portfolio.ts',
  'api/engine/statistics.ts',
  'api/engine/optimizer.ts',
  'api/engine/monteCarlo.ts',
  'api/engine/signal.ts',
  'api/engine/tactical.ts',
  'api/engine/tacticalGrid.ts',
  'api/engine/goalOptimizer.ts',
  'api/utils/integrity.ts',
  'api/utils/tickerValidation.ts',
  'api/middleware/validate.ts',
  'api/middleware/auditLog.ts',
  'api/middleware/idempotency.ts',
  'api/services/outboxWriter.ts',
  'api/services/outboxPublisher.ts',
  'api/utils/numericRange.ts',
  'src/store/authStore.ts',
  'src/utils/authTokens.ts',
];

const MIN_LINE_COVERAGE = 75;
const CRITICAL_LINE_COVERAGE = 90;
const GLOBAL_LINE_TARGET = 95;

/** 纯类型/barrel/基础设施/外部服务依赖（与 vitest.config.ts 的 coverage.exclude 同步） */
const PER_FILE_EXCLUDE_SUFFIXES = [
  'api/application/cqrs.ts',
  'api/application/backtest-command-service.ts',
  'api/utils/timeout.ts',
  'api/utils/tracePropagation.ts',
  'api/utils/logger.ts',
  'api/utils/metrics.ts',
  'api/utils/rustFallback.ts',
  'api/services/mailService.ts',
  'api/services/dataService.ts',
  'api/services/engineService.ts',
  'api/services/billingService.ts',
  'api/queues/worker.ts',
  'api/queues/jobIdempotency.ts',
  'api/queues/backtestQueue.ts',
  'api/domain/events/backtest-completed.ts',
  'api/domain/events/rebalance-triggered.ts',
  'api/routes/authRoutes.ts',
  'api/routes/orgRoutes.ts',
  'api/routes/billingRoutes.ts',
  'api/routes/tacticalRoutes.ts',
  'api/db/import.ts',
  'api/db/index.ts',
  'api/app.ts',
];

const failures = [];
const criticalFailures = [];
let checkedCount = 0;
let criticalCheckedCount = 0;

const normalize = (p) => p.replace(/\\/g, '/');

for (const [fileKey, data] of Object.entries(summary)) {
  if (fileKey === 'total') continue;

  const linesPct = data?.lines?.pct;
  if (typeof linesPct !== 'number') continue;

  const normalizedPath = normalize(fileKey);
  if (PER_FILE_EXCLUDE_SUFFIXES.some((suffix) => normalizedPath.endsWith(suffix))) {
    continue;
  }

  checkedCount += 1;
  const isCritical = CRITICAL_FILES.some((cf) => normalizedPath.endsWith(cf));

  if (isCritical) {
    criticalCheckedCount += 1;
    if (linesPct < CRITICAL_LINE_COVERAGE) {
      criticalFailures.push({
        file: normalizedPath,
        pct: linesPct,
        threshold: CRITICAL_LINE_COVERAGE,
        type: 'critical',
      });
    }
  }

  if (linesPct < MIN_LINE_COVERAGE) {
    failures.push({
      file: normalizedPath,
      pct: linesPct,
      threshold: MIN_LINE_COVERAGE,
      type: 'normal',
      isCritical,
    });
  }
}

const missingCritical = CRITICAL_FILES.filter(
  (cf) => !Object.keys(summary).some((k) => normalize(k).endsWith(cf)),
);

for (const f of missingCritical) {
  criticalFailures.push({
    file: f,
    pct: 0,
    threshold: CRITICAL_LINE_COVERAGE,
    type: 'critical-missing',
  });
}

const globalLines = summary.total?.lines?.pct ?? 0;
const globalFail = globalLines < GLOBAL_LINE_TARGET;

const allFailures = [
  ...criticalFailures,
  ...failures.filter((f) => !f.isCritical || f.pct < MIN_LINE_COVERAGE),
];

if (!globalFail && criticalFailures.length === 0 && failures.length === 0) {
  console.log('\n[coverage-check] 通过：全局与 per-file 覆盖率达标。');
  console.log(`  全局行覆盖率：${globalLines}%（≥${GLOBAL_LINE_TARGET}%）`);
  console.log(`  已检查 ${checkedCount} 个文件（关键文件 ${criticalCheckedCount} 个）。`);
  console.log(
    `  门槛：普通文件 ≥${MIN_LINE_COVERAGE}%，关键文件 ≥${CRITICAL_LINE_COVERAGE}%，全局 ≥${GLOBAL_LINE_TARGET}%`,
  );
  process.exit(0);
}

if (globalFail) {
  console.error(`\n[coverage-check] 全局行覆盖率 ${globalLines}% 未达 ${GLOBAL_LINE_TARGET}%`);
}

console.error('\n[coverage-check] 失败：以下文件覆盖率未达标。');
console.error(`  已检查 ${checkedCount} 个文件，${allFailures.length} 个未达标。`);
console.error(
  `  门槛：全部 ≥${MIN_LINE_COVERAGE}%，关键 ≥${CRITICAL_LINE_COVERAGE}%，全局 ≥${GLOBAL_LINE_TARGET}%`,
);

const printTable = (rows, title) => {
  if (rows.length === 0) return;
  console.error(`\n  ${title}（${rows.length} 个）：`);
  console.error('  ┌────────┬─────────────┬──────────────────────────────────────────────┐');
  console.error('  │ 覆盖率 │ 门槛        │ 文件                                          │');
  console.error('  ├────────┼─────────────┼──────────────────────────────────────────────┤');
  rows.forEach((r) => {
    const pctStr = `${r.pct}%`.padEnd(6);
    const thresholdStr = `≥ ${r.threshold}%`.padEnd(11);
    const fileDisplay = r.file.length > 44 ? '...' + r.file.slice(-41) : r.file.padEnd(44);
    console.error(`  │ ${pctStr} │ ${thresholdStr} │ ${fileDisplay} │`);
  });
  console.error('  └────────┴─────────────┴──────────────────────────────────────────────┘');
};

printTable(criticalFailures, `关键文件未达标（≥ ${CRITICAL_LINE_COVERAGE}%）`);
printTable(
  failures.filter((f) => f.pct < MIN_LINE_COVERAGE),
  `普通文件未达标（≥ ${MIN_LINE_COVERAGE}%）`,
);

process.exit(1);
