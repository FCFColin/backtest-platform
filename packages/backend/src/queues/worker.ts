/**
 * BullMQ Worker 启动入口
 *
 * 独立进程运行，消费 backtest-compute 队列中的任务。
 * 启动方式：node --import tsx api/queues/worker.ts
 *
 * Architecture: Worker独立进程，与API服务器解耦
 * 企业为何需要：Worker崩溃不影响API服务，可独立水平扩展
 * 权衡：需额外进程管理（pm2/k8s），但隔离性是生产级必需
 */

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
} from './jobIdempotency.js';
import { executeOptimization } from '../application/optimize-service.js';
import { executeGridSearch } from '../application/grid-application-service.js';
import { save } from '../repositories/backtestRunRepo.js';
import { Run } from '../domain/aggregates/run.js';
import { eventDispatcher } from '../domain/events/index.js';
import { getOrg } from '../application/org/membershipService.js';
import { getPlanLimits } from '../application/billing/planLimitsService.js';
import { appRedis } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { errorMessage, UpstreamProblemError } from '../utils/errors.js';
import { EngineUnavailableError } from '../utils/engineClient.js';
import type { Job } from 'bullmq';

/** 租户在途任务计数键（tenant-fair 调度，ADR-037） */
function inflightKey(tenantId: string): string {
  return `inflight:${tenantId}`;
}

/**
 * 解析租户的异步并发上限（按计划）。查询失败时回落 free 计划的保守上限。
 *
 * @param tenantId - 组织 UUID
 * @returns 允许的并发在途任务数
 */
async function tenantConcurrencyCap(tenantId: string): Promise<number> {
  try {
    const org = await getOrg(tenantId);
    return getPlanLimits(org?.plan).asyncConcurrency;
  } catch (err) {
    logger.warn({ err: String(err), tenantId }, '[worker] 组织查询失败，使用 free 并发上限');
    return getPlanLimits('free').asyncConcurrency;
  }
}

/**
 * 尝试为租户占用一个在途名额（tenant-fair 调度，ADR-037）。
 *
 * @param tenantId - 组织 UUID
 * @param jobId - 任务 ID（仅日志）
 * @returns 是否成功占用名额（true 时调用方需在结束后释放）
 * @throws DelayedError - 当租户在途任务已达计划上限时，延迟重试让出名额
 */
async function acquireTenantSlot(tenantId: string, jobId: string): Promise<boolean> {
  const cap = await tenantConcurrencyCap(tenantId);
  const key = inflightKey(tenantId);
  let inflight = 0;
  try {
    inflight = await appRedis.incr(key);
    if (inflight === 1) await appRedis.expire(key, 3600);
  } catch (err) {
    // Redis 异常时不阻断处理（计数失效优于任务卡死），跳过 fairness 门控
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

/** 释放租户在途名额（容错，失败仅忽略） */
async function releaseTenantSlot(tenantId: string): Promise<void> {
  try {
    await appRedis.decr(inflightKey(tenantId));
  } catch {
    /* ignore */
  }
}

/**
 * 处理 dispatchJob 执行中的引擎/业务错误（ADR-031 + RO-045）。
 *
 * - EngineUnavailableError（5xx/网络）：释放 claim 并重抛，触发 BullMQ 重试（fail-closed）
 * - UpstreamProblemError（4xx）：释放 claim 并标记永久失败（参数错误不可重试）
 * - 其他错误：释放 claim 并标记失败
 */
async function handleEngineError(err: unknown, jobId: string): Promise<BacktestJobResult> {
  if (err instanceof EngineUnavailableError) {
    await releaseJobClaim(jobId);
    logger.warn(
      { jobId, endpoint: '/api/engine/backtest', retryAfter: err.retryAfterSeconds },
      '[worker] Go 引擎不可用，重抛以触发 BullMQ 重试（fail-closed）',
    );
    throw err;
  }
  if (err instanceof UpstreamProblemError) {
    await releaseJobClaim(jobId);
    logger.warn(
      { jobId, status: err.status, code: err.code },
      '[worker] Go 引擎返回 4xx，任务标记为永久失败（参数错误不可重试）',
    );
    return { status: 'failed', error: err.detail };
  }
  await releaseJobClaim(jobId);
  const message = errorMessage(err);
  logger.error({ jobId, error: message }, '[worker] 任务执行失败');
  return { status: 'failed', error: message };
}

type JobHandler = (
  payload: unknown,
) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;

/** 任务类型 → 处理器分发表（消除 if/else 类型分发链） */
const JOB_HANDLERS: Record<string, JobHandler> = {
  optimizer: executeOptimization as JobHandler,
  'grid-search': executeGridSearch as JobHandler,
};

/** 任务分发核心（不含 tenant-fair 门控），供 processBacktestJob 包裹调用 */
async function dispatchJob(job: Job<BacktestJobData>): Promise<BacktestJobResult> {
  const { type, payload } = job.data;
  const jobId = String(job.id);

  // T-37：幂等守卫。处理中/已完成时不得向 BullMQ 返回假 completed，否则客户端轮询拿不到真实结果。
  const claim = await tryClaimJobProcessing(jobId);
  if (claim === 'already_processed') {
    const cached = await getProcessedJobResult(jobId);
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
    const handler = JOB_HANDLERS[type];
    if (handler) {
      const result = await handler(payload);
      if (result.success && result.data) {
        await markJobProcessed(jobId, result.data);
        await persistRunIfTenant(job, result.data);
        return { status: 'completed', result: result.data };
      }
      await releaseJobClaim(jobId);
      return { status: 'failed', error: result.error };
    }

    await releaseJobClaim(jobId);
    logger.warn({ type, jobId }, '[worker] 未知任务类型');
    return { status: 'failed', error: `Unknown job type: ${type}` };
  } catch (err) {
    if (err instanceof DelayedError) throw err;
    return await handleEngineError(err, jobId);
  }
}

/**
 * 将成功的异步任务结果落库到 backtest_runs（租户隔离，ADR-034）。
 *
 * ADR-013 Phase 2/3：通过 Run 聚合根驱动状态机（queued→running→completed），
 * 持久化后分发累积的领域事件（RunStarted/RunCompleted）。失败时仅日志，不影响任务结果。
 *
 * 仅当任务携带 tenantId 时持久化（匿名/无租户任务跳过，保持向后兼容）。
 * 持久化失败不影响任务结果返回——结果已在幂等缓存中，落库失败仅记录告警。
 */
async function persistRunIfTenant(
  job: Job<BacktestJobData>,
  result: Record<string, unknown>,
): Promise<void> {
  const { tenantId, ownerUserId, type, payload } = job.data;
  if (!tenantId) return;
  const jobId = String(job.id);
  try {
    // 通过 Run 聚合根驱动状态机：create→start→complete，产生 RunStarted + RunCompleted 事件
    const run = Run.create({
      id: jobId,
      name: type,
      request: payload,
      ownerUserId: ownerUserId ?? null,
    });
    run.start();
    run.complete(result);
    await save(tenantId, run);
    const events = run.pullEvents();
    for (const evt of events) {
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

/**
 * 任务处理核心逻辑（导出供单元测试使用）
 *
 * Architecture: 提取为独立导出函数，使worker进程和单元测试共用同一逻辑
 * 企业为何需要：匿名函数无法被单元测试直接调用，导出后可验证任务分发正确性
 */
export async function processBacktestJob(job: Job<BacktestJobData>): Promise<BacktestJobResult> {
  const { tenantId } = job.data;
  const jobId = String(job.id);

  // Tenant-fair 调度（ADR-037）：在 claim 之前限制单租户在途任务数，避免一个租户占满
  // 共享 worker 并发饿死其他租户。超过计划上限时 acquireTenantSlot 抛 DelayedError。
  let slotAcquired = false;
  if (tenantId) {
    slotAcquired = await acquireTenantSlot(tenantId, jobId);
  }
  try {
    return await dispatchJob(job);
  } finally {
    if (slotAcquired && tenantId) await releaseTenantSlot(tenantId);
  }
}

const worker = createBacktestWorker(processBacktestJob);

logger.info('[worker] Backtest worker started, waiting for jobs...');

// 优雅关闭（Task 5.3）
//
// 企业理由：Worker 收到 SIGTERM 时需等待当前任务完成，
// 避免任务中途被杀导致数据不一致。30s 强制退出兜底防止
// worker.close() 因长任务挂起。标志位防止重复触发。
let workerShuttingDown = false;

async function shutdownWorker(signal: string): Promise<void> {
  if (workerShuttingDown) {
    logger.info({ signal }, '[worker] 已在关闭流程中，忽略重复信号');
    return;
  }
  workerShuttingDown = true;
  logger.info({ signal }, `[worker] ${signal} received, shutting down gracefully...`);

  // 30s 强制退出兜底：防止 worker.close() 因长任务挂起
  const forceExitTimeout = setTimeout(() => {
    logger.error('[worker] Graceful shutdown timed out after 30s, forcing exit');
    process.exit(1);
  }, 30000);

  try {
    await worker.close();
    logger.info('[worker] Graceful shutdown complete');
  } catch (err) {
    logger.error({ err }, '[worker] Error during shutdown');
  } finally {
    clearTimeout(forceExitTimeout);
    process.exit(0);
  }
}

process.on('SIGTERM', () => {
  void shutdownWorker('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdownWorker('SIGINT');
});
