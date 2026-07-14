/**
 * 回测优化器路由 — POST /api/backtest-optimizer/optimize
 */
import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { validate } from '../middleware/validate.js';
import { backtestOptimizerSchema } from '../schemas/optimizer.js';
import { backtestQueue, type BacktestJobData } from '../queues/backtestQueue.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { sendProblem, UpstreamProblemError } from '../utils/errors.js';
import { withTimeout, TimeoutError } from '../utils/timeout.js';
import { EngineUnavailableError } from '../utils/engineClient.js';
import { executeOptimization } from '../application/optimizer-application-service.js';

const router = Router();

/** @deprecated 从 application 层导入；保留 re-export 供旧测试引用 */
export { executeOptimization } from '../application/optimizer-application-service.js';

router.post(
  '/optimize',
  validate(backtestOptimizerSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      try {
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user?.sub;
        const job = await backtestQueue.add('optimizer', {
          type: 'optimizer',
          payload: req.body,
          userId,
          // 多租户归属（ADR-034）：携带租户与提交者，供 worker 经 withTenant 落库并校验所有权。
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

      const result = await withTimeout(
        executeOptimization(req.body as Record<string, unknown>),
        config.SYNC_COMPUTE_TIMEOUT_MS,
        'backtest-optimizer 同步执行',
      );
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        sendProblem(res, 400, 'OPTIMIZER_BAD_REQUEST', 'Bad Request', {
          detail: String(result.error),
        });
      }
    } catch (error) {
      if (error instanceof EngineUnavailableError) {
        sendProblem(res, 503, 'ENGINE_UNAVAILABLE', 'Service Unavailable', {
          detail: error.message,
          headers: { 'Retry-After': String(error.retryAfterSeconds) },
          degraded: true,
          degradedWarning: '计算引擎暂不可用，已 fail-closed，未回退本地计算',
        });
        return;
      }
      // 4xx 客户端错误透传（RO-045）：返回上游原始状态码与 detail
      if (error instanceof UpstreamProblemError) {
        sendProblem(res, error.status, error.code, error.title, {
          detail: error.detail,
        });
        return;
      }
      if (error instanceof TimeoutError) {
        sendProblem(res, 503, 'OPTIMIZER_TIMEOUT', 'Service Unavailable', {
          detail: '计算超时，请缩小参数空间或稍后重试',
        });
        return;
      }
      logger.error({ err: error as Error }, 'Backtest optimizer error');
      sendProblem(res, 500, 'OPTIMIZER_ERROR', 'Internal Server Error', {
        detail: 'Failed to run backtest optimization',
      });
    }
  },
);

export default router;
