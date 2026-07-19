/**
 * 目标优化路由 — POST /api/goal-optimizer/optimize
 */
import { Router, type Request, type Response } from 'express';
import type { GoalOptimizerRequest } from '@backtest/shared/types';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { goalOptimizerSchema } from '../schemas/goalOptimizer.js';
import { executeGoalOptimizeWithFetch } from '../services/analysis-orchestrator.js';
import { sanitizeLog } from '../utils/logSanitizer.js';
import { asyncRouteHandler } from './routeUtils.js';

const router = Router();

router.post(
  '/optimize',
  validate(goalOptimizerSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const request = req.body as GoalOptimizerRequest;
      const tickers = request.assets
        .filter((a) => a.ticker?.trim())
        .map((a) => a.ticker.trim().toUpperCase());

      logger.info(
        `[GoalOptimizer] target=${request.targetAmount}, assets=${tickers.map((t) => sanitizeLog(t)).join(',')}`,
      );

      const result = await executeGoalOptimizeWithFetch(request);

      logger.info(`[GoalOptimizer] 完成, 耗时 ${Date.now() - startTime}ms`);
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[GoalOptimizer] 优化失败',
      code: 'GOAL_OPTIMIZER_ERROR',
      title: 'Goal optimization failed',
      detail: '目标优化失败',
      endpoint: 'goal-optimizer',
    },
  ),
);

export default router;
