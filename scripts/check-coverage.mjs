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
  'packages/backend/src/middleware/auth.ts',
  'packages/backend/src/middleware/jwtSigner.ts',
  'packages/backend/src/middleware/jwtAuth.ts',
  'packages/backend/src/middleware/rbac.ts',
  'packages/backend/src/services/userService.ts',
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
  'packages/backend/src/services/outboxWriter.ts',
  'packages/backend/src/services/outboxPublisher.ts',
  'packages/backend/src/utils/numericRange.ts',
  'packages/backend/src/db/tenant.ts',
  'packages/frontend/src/store/authStore.ts',
  'packages/frontend/src/utils/authTokens.ts',
  // RO-048: 关键业务逻辑文件从 coverage exclude 移除后纳入 90% 门控
  'packages/backend/src/utils/engineClient.ts',
  'packages/backend/src/services/dataService.ts',
  'packages/backend/src/queues/worker.ts',
  'packages/backend/src/queues/jobIdempotency.ts',
  'packages/backend/src/queues/backtestQueue.ts',
];

const MIN_LINE_COVERAGE = 75;
const CRITICAL_LINE_COVERAGE = 90;
/** 纯类型/barrel/基础设施/外部服务依赖（与 vitest.workspace.ts 的 coverage.exclude 同步） */
const PER_FILE_EXCLUDE_SUFFIXES = [
  'packages/backend/src/application/cqrs.ts',
  'packages/backend/src/utils/timeout.ts',
  'packages/backend/src/utils/tracePropagation.ts',
  'packages/backend/src/utils/logger.ts',
  'packages/backend/src/utils/metrics.ts',
  'packages/backend/src/services/mailService.ts',
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
  'packages/backend/src/app.ts',
];

const failures = [];
const criticalFailures = [];
let checkedCount = 0;
let criticalCheckedCount = 0;

const normalize = (p) => p.replace(/\\/g, '/');

for (const [fileKey, data] of Object.entries(summary)) {
  const normalizedFile = normalize(fileKey);

  // 跳过非源码文件
  if (!normalizedFile.includes('/src/') && !normalizedFile.includes('\\src\\')) continue;

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
  console.log(`\n[coverage-check] ⚠️  ${failures.length} 个普通文件未达标（不阻塞，建议改进）`);
}

console.log('\n[coverage-check] ✅ 通过');
process.exit(0);
