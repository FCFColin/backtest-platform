/**
 * 回测优化器路由 — POST /api/backtest-optimizer/optimize
 *
 * 异步优先（BullMQ），队列不可用时 fail-closed 503 per ADR-031。
 * 错误处理统一走 asyncRouteHandler。
 */
import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/miscMiddleware.js';
import { backtestOptimizerSchema } from '../schemas/backtest.js';
import { backtestQueue, type BacktestJobData } from '../queues/backtestQueue.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { sendProblem } from '../utils/errors.js';
import { asyncRouteHandler, ownerOf } from './routeUtils.js';

const router = Router();

router.post(
  '/optimize',
  validate(backtestOptimizerSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.sub;

      // 异步优先：尝试提交到 BullMQ 队列
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
        // 同步回退会阻塞 Node.js 事件循环，且多实例场景下无法保证请求路由到同一引擎实例。
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

export default router;
