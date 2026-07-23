/**
 * 战术网格搜索路由 — POST /api/tactical-grid/search
 *
 * 异步优先（BullMQ），队列不可用时回退同步执行。
 * 错误处理统一走 asyncRouteHandler。
 */
import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { validate } from '../middleware/validate.js';
import { tacticalGridSearchSchema } from '../schemas/tactical.js';
import { backtestQueue, type BacktestJobData } from '../queues/backtestQueue.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { sendProblem } from '../utils/errors.js';
import { withTimeout } from '../utils/timeout.js';
import {
  executeGridSearch,
  MAX_GRID_COMBINATIONS,
} from '../application/grid-application-service.js';
import type { TacticalGridRequest } from '../application/grid-application-service.js';
import { asyncRouteHandler } from './routeUtils.js';

const router = Router();

router.post(
  '/search',
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

      // 异步优先：尝试提交到 BullMQ 队列
      try {
        const job = await backtestQueue.add('grid-search', {
          type: 'grid-search',
          payload: req.body,
          userId,
          tenantId: authReq.tenantId,
          ownerUserId:
            userId && !userId.startsWith('apikey:') && !userId.startsWith('platform:')
              ? userId
              : null,
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

      // 同步降级：队列不可用时直接执行
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

export default router;
