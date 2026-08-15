import { DelayedError } from 'bullmq';
import {
  createBacktestWorker,
  type BacktestJobData,
  type BacktestJobResult,
} from './backtestQueue.js';
import {
  tryClaimJobProcessing,
  releaseJobClaim,
  markJobProcessed,
  getProcessedJobResult,
} from './queueUtils.js';
import { executeOptimization } from '../application/optimize-service.js';
import { runPortfolioBacktest } from '../application/backtest-service.js';
import { executeGridSearch } from '../application/grid-application-service.js';
import { save } from '../repositories/backtestRunRepo.js';
import { getOrgPlanLimit } from '../application/billing/planLimitsService.js';
import { appRedis } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { errorMessage, UpstreamProblemError } from '../utils/errors.js';
import type { Job } from 'bullmq';

const inflightKey = (tenantId: string): string => `inflight:${tenantId}`;
const DEFER_DELAY_MS = 10_000;

// 延迟重试：先 moveToDelayed 再把 job 移出 active，避免 DelayedError 让 job 停在 active
// 而走 stalled 检查（maxStalledCount=1 时二次即永久失败，BullMQ 5.79 语义，ADR-010 公平调度失效）。
async function deferJob(job: Job<BacktestJobData>, reason: string): Promise<never> {
  try {
    await job.moveToDelayed(Date.now() + DEFER_DELAY_MS, job.token);
  } catch (err) {
    throw new Error(`延迟重试标记失败（${reason}）: ${errorMessage(err)}`);
  }
  throw new DelayedError(reason);
}

async function acquireTenantSlot(job: Job<BacktestJobData>): Promise<boolean> {
  const tenantId = job.data.tenantId!;
  const jobId = String(job.id);
  const cap = await getOrgPlanLimit(
    tenantId,
    'asyncConcurrency',
    '[worker] 组织查询失败，使用 free 并发上限',
  );
  const key = inflightKey(tenantId);
  let inflight = 0;
  try {
    inflight = await appRedis.incr(key);
    if (inflight === 1) await appRedis.expire(key, 3600);
  } catch (err) {
    logger.warn(
      { err: String(err), tenantId, jobId },
      '[worker] 在途计数失败，跳过 tenant-fair 门控',
    );
    return false;
  }
  if (inflight > cap) {
    try {
      await appRedis.decr(key);
    } catch {
      /* ignore */
    }
    logger.info({ jobId, tenantId, cap }, '[worker] 租户在途任务已达上限，延迟重试');
    return deferJob(job, 'Tenant concurrency cap reached');
  }
  return true;
}

async function releaseTenantSlot(tenantId: string): Promise<void> {
  try {
    await appRedis.decr(inflightKey(tenantId));
  } catch {
    /* ignore */
  }
}

async function handleEngineError(
  err: unknown,
  jobId: string,
  type: string,
): Promise<BacktestJobResult> {
  await releaseJobClaim(jobId, type);
  if (err instanceof UpstreamProblemError) {
    logger.warn({ jobId, status: err.status, code: err.code }, '[worker] 引擎 4xx，永久失败');
    return { status: 'failed', error: err.detail };
  }
  // 其余错误（引擎不可用/瞬时网络/未知异常）重抛，触发 BullMQ 重试（attempts=3 指数退避）
  logger.warn({ jobId, error: errorMessage(err) }, '[worker] 任务瞬时失败，触发 BullMQ 重试');
  throw err;
}

type JobHandler = (
  payload: unknown,
) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;

const JOB_HANDLERS: Record<string, JobHandler> = {
  optimizer: executeOptimization as JobHandler,
  'grid-search': executeGridSearch as JobHandler,
};

async function dispatchJob(job: Job<BacktestJobData>): Promise<BacktestJobResult> {
  const { type, payload } = job.data;
  const jobId = String(job.id);

  const claim = await tryClaimJobProcessing(jobId, type);
  if (claim === 'already_processed') {
    const cached = await getProcessedJobResult(jobId, type);
    if (cached) {
      logger.info({ jobId, type }, '[worker] 返回已缓存的幂等结果');
      return { status: 'completed', result: cached };
    }
    logger.warn({ jobId, type }, '[worker] 已处理标记存在但无缓存结果，延迟重试');
    return deferJob(job, 'Processed marker without cached result');
  }
  if (claim === 'in_progress') {
    logger.info({ jobId, type }, '[worker] 任务正在处理中，延迟重试');
    return deferJob(job, 'Job already being processed');
  }

  logger.info({ type, jobId }, '[worker] 开始处理任务');

  try {
    if (type === 'portfolio') {
      const p = payload as { portfolios: unknown[]; parameters: Record<string, unknown> };
      const { result, warnings, dateRange } = await runPortfolioBacktest({
        portfolios: p.portfolios as Parameters<typeof runPortfolioBacktest>[0]['portfolios'],
        parameters: p.parameters as unknown as Parameters<
          typeof runPortfolioBacktest
        >[0]['parameters'],
        tenantId: job.data.tenantId,
        onProgress: (pct: number) => {
          void job.updateProgress(pct);
        },
      });
      const portfolioResult = { data: result, warnings, dateRange };
      await markJobProcessed(jobId, type, portfolioResult as Record<string, unknown>);
      await persistRunIfTenant(job, 'completed', portfolioResult);
      return { status: 'completed', result: portfolioResult };
    }

    const handler = JOB_HANDLERS[type];
    if (handler) {
      const result = await handler(payload);
      if (result.success && result.data) {
        await markJobProcessed(jobId, type, result.data);
        await persistRunIfTenant(job, 'completed', result.data);
        return { status: 'completed', result: result.data };
      }
      await persistRunIfTenant(job, 'failed');
      await releaseJobClaim(jobId, type);
      return { status: 'failed', error: result.error };
    }

    await releaseJobClaim(jobId, type);
    logger.warn({ type, jobId }, '[worker] 未知任务类型');
    return { status: 'failed', error: `Unknown job type: ${type}` };
  } catch (err) {
    if (err instanceof DelayedError) throw err;
    await persistRunIfTenant(job, 'failed');
    const failed = await handleEngineError(err, jobId, type);
    return failed;
  }
}

// 将异步任务最终状态（成功/失败）落库到 backtest_runs（租户隔离，ADR-009）。
async function persistRunIfTenant(
  job: Job<BacktestJobData>,
  status: 'completed' | 'failed',
  result?: unknown,
): Promise<void> {
  const { tenantId, ownerUserId, type, payload } = job.data;
  if (!tenantId) return;
  const jobId = String(job.id);
  try {
    await save(tenantId, {
      id: jobId,
      name: type,
      request: payload,
      result: status === 'completed' ? (result ?? null) : null,
      status,
      ownerUserId: ownerUserId ?? null,
    });
  } catch (err) {
    logger.warn(
      { jobId, tenantId, err: String(err) },
      '[worker] 回测结果落库失败（结果仍可经任务状态获取）',
    );
  }
}

export async function processBacktestJob(job: Job<BacktestJobData>): Promise<BacktestJobResult> {
  const { tenantId } = job.data;
  // Tenant-fair 调度（ADR-010）：限制单租户在途任务数
  let slotAcquired = false;
  if (tenantId) slotAcquired = await acquireTenantSlot(job);
  try {
    return await dispatchJob(job);
  } finally {
    if (slotAcquired && tenantId) await releaseTenantSlot(tenantId);
  }
}

const worker = createBacktestWorker(processBacktestJob);
logger.info('[worker] Backtest worker started, waiting for jobs...');

let workerShuttingDown = false;

export async function shutdownWorker(signal: string): Promise<void> {
  if (workerShuttingDown) {
    logger.info({ signal }, '[worker] 已在关闭流程中，忽略重复信号');
    return;
  }
  workerShuttingDown = true;
  logger.info({ signal }, `[worker] ${signal} received, shutting down gracefully...`);
  const forceExitTimeout = setTimeout(() => {
    logger.error('[worker] Graceful shutdown timed out after 30s, forcing exit');
    process.exit(1);
  }, 30000);
  try {
    await worker.close();
    logger.info('[worker] Backtest worker closed');
  } catch (err) {
    logger.error({ err }, '[worker] Error during shutdown');
  } finally {
    clearTimeout(forceExitTimeout);
  }
}
