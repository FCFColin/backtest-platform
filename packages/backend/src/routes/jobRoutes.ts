import { Router, type Request, type Response } from 'express';
import { backtestQueue, type BacktestJobData } from '../queues/backtestQueue.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { resolveTenant } from '../middleware/tenantContext.js';
import { computeMiddleware } from '../middleware/middlewareChains.js';
import { Permission } from '../middleware/rbac.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { config } from '../config/index.js';
import { validate } from '../middleware/miscMiddleware.js';
import { backtestOptimizerSchema } from '../schemas/backtest.js';
import { tacticalGridSearchSchema } from '../schemas/tactical.js';
import { withTimeout } from '../utils/misc.js';
import {
  executeGridSearch,
  MAX_GRID_COMBINATIONS,
  type TacticalGridRequest,
} from '../application/grid-application-service.js';
import { asyncRouteHandler, crudRouteHandler, ownerOf } from './routeUtils.js';

const router = Router();
export const jobRoutes = router;

function buildJobResult(
  job: NonNullable<Awaited<ReturnType<typeof backtestQueue.getJob>>>,
  state: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: job.id,
    type: job.data.type,
    state,
    createdAt: job.timestamp,
    processedAt: job.processedOn,
    finishedAt: job.finishedOn,
  };
  if (state === 'completed' && job.returnvalue) {
    const rv = job.returnvalue as { status?: string; result?: unknown };
    // worker 返回 {status, result}，解包使 result.data 可直接消费
    result.result = rv.status ? rv.result : rv;
  } else if (state === 'failed') {
    logger.error(
      { middleware: 'jobRoutes', jobId: job.id, failedReason: job.failedReason },
      '[jobRoutes] 任务执行失败',
    );
    result.error = 'Job execution failed';
  }
  return result;
}

function authorizeJob(
  res: Response,
  job: NonNullable<Awaited<ReturnType<typeof backtestQueue.getJob>>>,
  requester: NonNullable<AuthenticatedRequest['user']>,
  reqTenantId: string | undefined,
  jobId: string,
): boolean {
  const ownerId = job.data?.userId;
  const jobTenant = job.data?.tenantId;
  const hasOwnership =
    (ownerId !== undefined && ownerId === requester.sub) || requester.role === 'admin';
  const passesTenantCheck =
    !jobTenant || jobTenant === reqTenantId || requester.platform_admin === true;

  if (!hasOwnership || !passesTenantCheck) {
    logger.warn(
      {
        middleware: 'jobRoutes',
        jobId,
        requester: requester.sub,
        owner: ownerId,
        jobTenant,
        reqTenant: reqTenantId,
      },
      '[jobRoutes] 拒绝越权访问任务结果',
    );
    sendProblem(res, 404, 'JOB_NOT_FOUND');
    return true;
  }
  return false;
}

// GET /api/v1/jobs/:id — 仅任务提交者或 admin 可读取（ADR-019 IDOR 防护）
router.get(
  '/jobs/:id',
  jwtAuth,
  resolveTenant,
  crudRouteHandler(
    async (req, res): Promise<void> => {
      const requester = req.user;
      if (!requester) {
        sendProblem(res, 401, 'UNAUTHORIZED');
        return;
      }

      const job = await backtestQueue.getJob(req.params.id);
      if (!job) {
        sendProblem(res, 404, 'JOB_NOT_FOUND');
        return;
      }

      if (authorizeJob(res, job, requester, req.tenantId, req.params.id)) return;

      const state = await job.getState();
      res.json({ success: true, data: buildJobResult(job, state) });
    },
    {
      logMsg: '[jobRoutes] 查询任务状态失败',
      code: 'JOB_STATUS_ERROR',
    },
  ),
);

// POST /api/v1/backtest-optimizer/optimize — 队列不可用时 fail-closed 503 per ADR-031
router.post(
  '/backtest-optimizer/optimize',
  ...computeMiddleware(Permission.OPTIMIZER_RUN),
  validate(backtestOptimizerSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.sub;

      try {
        const job = await backtestQueue.add('optimizer', {
          type: 'optimizer',
          payload: req.body,
          userId,
          tenantId: authReq.tenantId,
          ownerUserId: ownerOf(authReq),
        } as BacktestJobData);

        res.status(202).json({
          success: true,
          data: {
            jobId: job.id,
            statusUrl: `/api/v1/jobs/${job.id}`,
          },
        });
      } catch (queueError) {
        // ADR-031：队列不可用时 fail-closed 返回 503 + Retry-After，不再回退到同步执行。
        logger.error(
          { err: (queueError as Error).message },
          '[backtest-optimizer] BullMQ 队列不可用，fail-closed 返回 503',
        );
        sendProblem(res, 503, 'OPTIMIZER_QUEUE_UNAVAILABLE', 'Service temporarily unavailable', {
          detail: 'Optimizer queue is not available. Please retry in a moment.',
          headers: { 'Retry-After': '60' },
        });
      }
    },
    {
      logMsg: 'Backtest optimizer error',
      code: 'OPTIMIZER_ERROR',
      endpoint: 'backtest-optimizer',
    },
  ),
);

router.post(
  '/tactical-grid/search',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  validate(tacticalGridSearchSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const body = req.body as TacticalGridRequest;
      const p1Count = Math.floor((body.param1.max - body.param1.min) / body.param1.step) + 1;
      const p2Count = Math.floor((body.param2.max - body.param2.min) / body.param2.step) + 1;
      if (p1Count * p2Count > MAX_GRID_COMBINATIONS) {
        sendProblem(res, 422, 'GRID_TOO_MANY_COMBINATIONS');
        return;
      }

      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.sub;

      try {
        const job = await backtestQueue.add('grid-search', {
          type: 'grid-search',
          payload: req.body,
          userId,
          tenantId: authReq.tenantId,
          ownerUserId: ownerOf(authReq),
        } as BacktestJobData);

        res.status(202).json({
          type: 'https://httpstatuses.com/202',
          title: 'Accepted',
          status: 202,
          detail: 'Grid search task submitted',
          jobId: job.id,
          statusUrl: `/api/v1/jobs/${job.id}`,
        });
        return;
      } catch (queueError) {
        logger.warn(
          { error: (queueError as Error).message },
          '[tactical-grid] BullMQ不可用，回退到同步执行',
        );
      }

      const result = await withTimeout(
        executeGridSearch(req.body as Record<string, unknown>),
        config.SYNC_COMPUTE_TIMEOUT_MS,
        'tactical-grid 同步执行',
      );
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        sendProblem(res, 400, 'GRID_BAD_REQUEST');
      }
    },
    {
      logMsg: '[tactical-grid] 网格搜索失败',
      code: 'GRID_SEARCH_ERROR',
      endpoint: 'tactical-grid',
    },
  ),
);
