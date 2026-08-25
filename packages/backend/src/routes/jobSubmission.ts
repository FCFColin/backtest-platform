/**
 * 异步任务提交路由工厂 — portfolio/optimizer/grid-search 三端点共享的 queue.add + 失败处理骨架。
 * grid 的 GRID_TOO_MANY_COMBINATIONS 预校验保留在各路由声明处。
 */
import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { backtestQueue, type BacktestJobData } from '../queues/backtestQueue.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { crudRouteHandler, ownerOf } from './routeUtils.js';
import { sendProblem, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { TimeoutError, withTimeout } from '../utils/misc.js';
import { config } from '../config/index.js';
import { recordBacktestRequest } from '../utils/metrics.js';
import { createRun } from '../repositories/backtestRunRepo.js';

interface SubmitQueueJobConfig {
  type: BacktestJobData['type'];
  statusUrl: (jobId: string) => string;
  onQueueDown: 'fail-closed' | 'sync-fallback';
  queueDownCode?: string;
  retryAfter?: string;
  detail?: string;
  jobStatus?: string;
  fallback?: (body: unknown) => Promise<{
    data?: unknown;
    degraded?: boolean;
    degradedWarning?: string;
  }>;
  metric?: string;
  logMsg: string;
  code: string;
  endpoint: string;
}

/** 队列不可用时同步兜底：成功返回 200 + 结果（含 degraded 透传），异常落 400 GRID_BAD_REQUEST */
async function runSyncFallback(
  cfg: SubmitQueueJobConfig,
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await withTimeout(
      cfg.fallback!(req.body),
      config.SYNC_COMPUTE_TIMEOUT_MS,
      cfg.endpoint,
    );
    res.json({
      success: true,
      data: result.data,
      ...(result.degraded ? { degraded: true } : {}),
      ...(result.degradedWarning ? { degradedWarning: result.degradedWarning } : {}),
    });
  } catch (err) {
    if (err instanceof TimeoutError) {
      sendProblem(res, 503, cfg.queueDownCode ?? 'GRID_TIMEOUT', 'Service temporarily unavailable');
    } else if (err instanceof ValidationError) {
      sendProblem(res, 400, 'GRID_BAD_REQUEST');
    } else {
      sendProblem(res, 500, cfg.code);
    }
  }
}

export function submitQueueJob(cfg: SubmitQueueJobConfig): RequestHandler {
  const { type, statusUrl } = cfg;
  return crudRouteHandler(
    async (req, res) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const job = await backtestQueue.add(
          type,
          {
            type,
            payload: req.body,
            tenantId: authReq.tenantId,
            ownerUserId: ownerOf(authReq),
          } as BacktestJobData,
          // BullMQ 自增数字 id 写不进 backtest_runs 的 UUID 主键（ADR-009），故显式 UUID
          { jobId: randomUUID() },
        );
        const jobId = job.id!;
        // A5：提交即落 queued（DB 状态 pending）行——Redis 数据丢失时任务不再凭空蒸发；
        // worker persistRunIfTenant 的 UPSERT 会将其推进到 completed/failed
        if (authReq.tenantId) {
          try {
            await createRun(authReq.tenantId, ownerOf(authReq), {
              name: type,
              request: req.body,
              status: 'pending',
            });
          } catch (persistErr) {
            logger.warn(
              { err: (persistErr as Error).message, jobId },
              '[jobSubmission] queued 行落库失败（任务仍已入队，状态可经 statusUrl 获取）',
            );
          }
        }
        res.status(202).json({
          success: true,
          data: {
            jobId,
            ...(cfg.jobStatus ? { status: cfg.jobStatus } : {}),
            statusUrl: statusUrl(jobId),
          },
        });
        if (cfg.metric) recordBacktestRequest(cfg.metric, 'async', 'success');
      } catch (queueError) {
        if (cfg.onQueueDown === 'sync-fallback') {
          await runSyncFallback(cfg, req, res);
          return;
        }
        if (cfg.metric) recordBacktestRequest(cfg.metric, 'async', 'queue_error');
        logger.error({ err: (queueError as Error).message }, cfg.logMsg);
        sendProblem(res, 503, cfg.queueDownCode!, 'Service temporarily unavailable', {
          detail: cfg.detail,
          headers: { 'Retry-After': cfg.retryAfter! },
        });
      }
    },
    { logMsg: cfg.logMsg, code: cfg.code, endpoint: cfg.endpoint },
  );
}
