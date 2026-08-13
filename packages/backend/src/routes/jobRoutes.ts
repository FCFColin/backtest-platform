import { Router, type Request, type Response, type NextFunction } from 'express';
import { backtestQueue } from '../queues/backtestQueue.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { resolveTenant } from '../middleware/tenantContext.js';
import { computeMiddleware } from '../middleware/middlewareChains.js';
import { Permission } from '../middleware/rbac.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { validate } from '../middleware/miscMiddleware.js';
import { backtestOptimizerSchema } from '../schemas/backtest.js';
import { tacticalGridSearchSchema } from '../schemas/tactical.js';
import {
  executeGridSearch,
  countCombinations,
  MAX_GRID_COMBINATIONS,
  type TacticalGridRequest,
} from '../application/grid-application-service.js';
import { crudRouteHandler } from './routeUtils.js';
import { submitQueueJob } from './jobSubmission.js';
import { jobAccessGranted } from '../middleware/jobAccess.js';

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

      if (!jobAccessGranted(job, requester, req.tenantId)) {
        logger.warn(
          { middleware: 'jobRoutes', jobId: req.params.id, requester: requester.sub },
          '[jobRoutes] 拒绝越权访问任务结果',
        );
        sendProblem(res, 404, 'JOB_NOT_FOUND');
        return;
      }

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
  submitQueueJob({
    type: 'optimizer',
    onQueueDown: 'fail-closed',
    statusUrl: (jobId) => `/api/v1/jobs/${jobId}`,
    queueDownCode: 'OPTIMIZER_QUEUE_UNAVAILABLE',
    retryAfter: '60',
    detail: 'Optimizer queue is not available. Please retry in a moment.',
    logMsg: 'Backtest optimizer error',
    code: 'OPTIMIZER_ERROR',
    endpoint: 'backtest-optimizer',
  }),
);

router.post(
  '/tactical-grid/search',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  validate(tacticalGridSearchSchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { param1, param2 } = req.body as TacticalGridRequest;
    if (countCombinations(param1, param2) > MAX_GRID_COMBINATIONS) {
      sendProblem(res, 422, 'GRID_TOO_MANY_COMBINATIONS');
      return;
    }
    next();
  },
  submitQueueJob({
    type: 'grid-search',
    onQueueDown: 'sync-fallback',
    fallback: (body) => executeGridSearch(body as Record<string, unknown>),
    respond202: (res, jobId) =>
      res.status(202).json({
        type: 'https://httpstatuses.com/202',
        title: 'Accepted',
        status: 202,
        detail: 'Grid search task submitted',
        jobId,
        statusUrl: `/api/v1/jobs/${jobId}`,
      }),
    logMsg: '[tactical-grid] 网格搜索失败',
    code: 'GRID_SEARCH_ERROR',
    endpoint: 'tactical-grid',
  }),
);
