/**
 * 目标优化路由 — POST /api/goal-optimizer/optimize
 */
import { Router, type Request, type Response } from 'express';
import type { GoalOptimizerRequest } from '../../shared/types.js';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { validate } from '../middleware/validate.js';
import { goalOptimizerSchema } from '../schemas/goalOptimizer.js';
import { executeGoalOptimize } from '../application/analytics-application-service.js';
import { sanitizeLog } from '../utils/logSanitizer.js';

const router = Router();

/** 判断错误消息是否属于可向客户端暴露的验证类错误 */
function isClientFacingError(message: string): boolean {
  return message.includes('未找到') || message.includes('有效标的') || message.includes('数据不足');
}

router.post(
  '/optimize',
  validate(goalOptimizerSchema),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const request = req.body as GoalOptimizerRequest;

      const endDateStr = new Date().toISOString().split('T')[0];
      const startDateStr = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const tickers = request.assets
        .filter((a) => a.ticker?.trim())
        .map((a) => a.ticker.trim().toUpperCase());

      logger.info(
        `[GoalOptimizer] target=${request.targetAmount}, assets=${tickers.map((t) => sanitizeLog(t)).join(',')}`,
      );

      const priceData = await fetchHistoryData(
        Array.from(new Set(tickers)),
        startDateStr,
        endDateStr,
      );
      const result = executeGoalOptimize(request, priceData, startDateStr, endDateStr);

      logger.info(`[GoalOptimizer] 完成, 耗时 ${Date.now() - startTime}ms`);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isClientFacingError(message)) {
        sendProblem(res, 422, 'GOAL_VALIDATION', 'Goal optimizer validation failed', {
          detail: message,
        });
        return;
      }
      logger.error({ err: error as Error }, '[GoalOptimizer] 优化失败');
      sendProblem(res, 500, 'GOAL_OPTIMIZER_ERROR', 'Goal optimization failed', {
        detail: message || '目标优化失败',
      });
    }
  },
);

export default router;
