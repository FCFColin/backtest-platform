/**
 * 回测优化器路由 — POST /api/backtest-optimizer/optimize
 *
 * 异步优先（BullMQ），队列不可用时回退同步执行。
 * 错误处理统一走 asyncRouteHandler。
 */
import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { validate } from '../middleware/validate.js';
import { backtestOptimizerSchema } from '../schemas/optimizer.js';
import { backtestQueue, type BacktestJobData } from '../queues/backtestQueue.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { sendProblem } from '../utils/errors.js';
import { withTimeout } from '../utils/timeout.js';
import { executeOptimization } from '../application/optimize-service.js';
import { asyncRouteHandler } from './routeUtils.js';

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
          ownerUserId:
            userId && !userId.startsWith('apikey:') && !userId.startsWith('platform:')
              ? userId
              : null,
        } as BacktestJobData);

        res.status(202).json({
          success: true,
          data: {
            jobId: job.id,
            statusUrl: `/api/v1/jobs/${job.id}`,
          },
        });
        return;
      } catch (queueError) {
        logger.warn(
          { error: (queueError as Error).message },
          '[backtest-optimizer] BullMQ不可用，回退到同步执行',
        );
      }

      // 同步降级：队列不可用时直接执行
      const result = await withTimeout(
        executeOptimization(req.body as Record<string, unknown>),
        config.SYNC_COMPUTE_TIMEOUT_MS,
        'backtest-optimizer 同步执行',
      );
      if (result.success) {
        const response: Record<string, unknown> = { success: true, data: result.data };
        if (result.warnings && result.warnings.length > 0) {
          response.warnings = result.warnings;
        }
        if (result.dateRange) {
          response.dateRange = result.dateRange;
        }
        res.json(response);
      } else {
        sendProblem(res, 400, 'OPTIMIZER_BAD_REQUEST');
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
