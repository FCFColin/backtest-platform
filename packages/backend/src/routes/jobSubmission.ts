/**
 * 异步任务提交路由工厂 — portfolio/optimizer/grid-search 三端点共享的 queue.add + 失败处理骨架。
 * grid 的 GRID_TOO_MANY_COMBINATIONS 预校验保留在各路由声明处。
 */
import type { RequestHandler, Response } from 'express';
import { backtestQueue, type BacktestJobData } from '../queues/backtestQueue.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { asyncRouteHandler, ownerOf } from './routeUtils.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { withTimeout } from '../utils/misc.js';
import { config } from '../config/index.js';
import { recordBacktestRequest } from '../utils/metrics.js';

interface SubmitQueueJobConfig {
  type: BacktestJobData['type'];
  statusUrl?: (jobId: string) => string;
  onQueueDown: 'fail-closed' | 'sync-fallback';
  queueDownCode?: string;
  retryAfter?: string;
  detail?: string;
  jobStatus?: string;
  respond202?: (res: Response, jobId: string) => void;
  fallback?: (body: unknown) => Promise<{ success: boolean; data?: unknown }>;
  metric?: string;
  logMsg: string;
  code: string;
  endpoint: string;
}

export function submitQueueJob(cfg: SubmitQueueJobConfig): RequestHandler {
  const { type, statusUrl } = cfg;
  return asyncRouteHandler(
    async (req, res) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const job = await backtestQueue.add(type, {
          type,
          payload: req.body,
          userId: authReq.user?.sub,
          tenantId: authReq.tenantId,
          ownerUserId: ownerOf(authReq),
        } as BacktestJobData);
        if (cfg.respond202) {
          cfg.respond202(res, job.id);
        } else {
          res.status(202).json({
            success: true,
            data: {
              jobId: job.id,
              ...(cfg.jobStatus ? { status: cfg.jobStatus } : {}),
              statusUrl: statusUrl!(job.id),
            },
          });
        }
        if (cfg.metric) recordBacktestRequest(cfg.metric, 'async', 'success');
      } catch (queueError) {
        if (cfg.onQueueDown === 'sync-fallback') {
          const result = await withTimeout(
            cfg.fallback!(req.body),
            config.SYNC_COMPUTE_TIMEOUT_MS,
            cfg.endpoint,
          );
          if (result.success) {
            res.json({ success: true, data: result.data });
            return;
          }
          sendProblem(res, 400, 'GRID_BAD_REQUEST');
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

/** 任务所有权/租户判定（ADR-019 IDOR 防护）。未认证请求（/runs/:jobId 兼容路径）放行。 */
export function jobAccessGranted(
  job: { data?: { userId?: string; tenantId?: string } },
  requester: AuthenticatedRequest['user'],
  reqTenantId?: string,
): boolean {
  if (!requester) return true;
  const ownerId = job.data?.userId;
  const jobTenant = job.data?.tenantId;
  const hasOwnership =
    (ownerId !== undefined && ownerId === requester.sub) || requester.role === 'admin';
  const passesTenantCheck =
    !jobTenant || jobTenant === reqTenantId || requester.platform_admin === true;
  return hasOwnership && passesTenantCheck;
}
