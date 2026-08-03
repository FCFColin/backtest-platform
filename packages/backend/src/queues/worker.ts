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
import { Run } from '../domain/aggregates/run.js';
import { eventDispatcher } from '../domain/events/events.js';
import { getOrg } from '../application/org/membershipService.js';
import { getPlanLimits } from '../application/billing/planLimitsService.js';
import { appRedis } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { errorMessage, UpstreamProblemError } from '../utils/errors.js';
import { EngineUnavailableError } from '../utils/engineClient.js';
import type { Job } from 'bullmq';

function inflightKey(tenantId: string): string {
  return `inflight:${tenantId}`;
}

async function tenantConcurrencyCap(tenantId: string): Promise<number> {
  try {
    const org = await getOrg(tenantId);
    return getPlanLimits(org?.plan).asyncConcurrency;
  } catch (err) {
    logger.warn({ err: String(err), tenantId }, '[worker] 组织查询失败，使用 free 并发上限');
    return getPlanLimits('free').asyncConcurrency;
  }
}

async function acquireTenantSlot(tenantId: string, jobId: string): Promise<boolean> {
  const cap = await tenantConcurrencyCap(tenantId);
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
    throw new DelayedError('Tenant concurrency cap reached');
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
  if (err instanceof EngineUnavailableError) {
    logger.warn(
      { jobId, endpoint: '/api/engine/backtest', retryAfter: err.retryAfterSeconds },
      '[worker] Go 引擎不可用，重抛以触发 BullMQ 重试（fail-closed）',
    );
    throw err;
  }
  if (err instanceof UpstreamProblemError) {
    logger.warn(
      { jobId, status: err.status, code: err.code },
      '[worker] Go 引擎返回 4xx，任务标记为永久失败（参数错误不可重试）',
    );
    return { status: 'failed', error: err.detail };
  }
  const message = errorMessage(err);
  logger.error({ jobId, error: message }, '[worker] 任务执行失败');
  return { status: 'failed', error: message };
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
    throw new DelayedError('Processed marker without cached result');
  }
  if (claim === 'in_progress') {
    logger.info({ jobId, type }, '[worker] 任务正在处理中，延迟重试');
    throw new DelayedError('Job already being processed');
  }

  logger.info({ type, jobId }, '[worker] 开始处理任务');

  try {
    if (type === 'portfolio') {
      const portfolioPayload = payload as {
        portfolios: unknown[];
        parameters: Record<string, unknown>;
      };
      const { result, warnings, dateRange } = await runPortfolioBacktest({
        portfolios: portfolioPayload.portfolios as Parameters<
          typeof runPortfolioBacktest
        >[0]['portfolios'],
        parameters: portfolioPayload.parameters as unknown as Parameters<
          typeof runPortfolioBacktest
        >[0]['parameters'],
        tenantId: job.data.tenantId,
        ownerUserId: job.data.ownerUserId ?? undefined,
        onProgress: (pct: number) => {
          void job.updateProgress(pct);
        },
      });
      const portfolioResult = { data: result, warnings, dateRange };
      await markJobProcessed(jobId, type, portfolioResult as Record<string, unknown>);
      return { status: 'completed', result: portfolioResult };
    }

    const handler = JOB_HANDLERS[type];
    if (handler) {
      const result = await handler(payload);
      if (result.success && result.data) {
        await markJobProcessed(jobId, type, result.data);
        await persistRunIfTenant(job, result.data);
        return { status: 'completed', result: result.data };
      }
      await releaseJobClaim(jobId, type);
      return { status: 'failed', error: result.error };
    }

    await releaseJobClaim(jobId, type);
    logger.warn({ type, jobId }, '[worker] 未知任务类型');
    return { status: 'failed', error: `Unknown job type: ${type}` };
  } catch (err) {
    if (err instanceof DelayedError) throw err;
    return await handleEngineError(err, jobId, type);
  }
}

// 将成功的异步任务结果落库到 backtest_runs（租户隔离，ADR-034）。
async function persistRunIfTenant(
  job: Job<BacktestJobData>,
  result: Record<string, unknown>,
): Promise<void> {
  const { tenantId, ownerUserId, type, payload } = job.data;
  if (!tenantId) return;
  const jobId = String(job.id);
  try {
    const run = Run.create({
      id: jobId,
      name: type,
      request: payload,
      ownerUserId: ownerUserId ?? null,
    });
    run.start();
    run.complete(result);
    await save(tenantId, run);
    for (const evt of run.pullEvents()) {
      void eventDispatcher.dispatch(evt).catch((err) => {
        logger.error({ err, jobId, eventType: evt.eventType }, '[worker] Run 事件分发失败');
      });
    }
  } catch (err) {
    logger.warn(
      { jobId, tenantId, err: String(err) },
      '[worker] 回测结果落库失败（结果仍可经任务状态获取）',
    );
  }
}

export async function processBacktestJob(job: Job<BacktestJobData>): Promise<BacktestJobResult> {
  const { tenantId } = job.data;
  const jobId = String(job.id);
  // Tenant-fair 调度（ADR-037）：限制单租户在途任务数
  let slotAcquired = false;
  if (tenantId) slotAcquired = await acquireTenantSlot(tenantId, jobId);
  try {
    return await dispatchJob(job);
  } finally {
    if (slotAcquired && tenantId) await releaseTenantSlot(tenantId);
  }
}

const worker = createBacktestWorker(processBacktestJob);
logger.info('[worker] Backtest worker started, waiting for jobs...');

// 优雅关闭：等待当前任务完成，30s 强制退出兜底。
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
