/**
 * LETF 滑点路由 — POST /api/letf/analyze
 */
import { Router, type Request, type Response } from 'express';
import type { LETFRequest } from '@backtest/shared/types/letf';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { letfAnalyzeSchema } from '../schemas/letf.js';
import { executeLetfAnalyzeWithFetch } from '../services/analysis-orchestrator.js';
import { asyncRouteHandler } from './routeUtils.js';

const router = Router();

router.post(
  '/analyze',
  validate(letfAnalyzeSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const body = req.body as LETFRequest;
      logger.info(`[LETF] 开始分析: letf=${body.letfTicker}, bench=${body.benchmarkTicker}`);

      const result = await executeLetfAnalyzeWithFetch(body);

      logger.info(`[LETF] 分析完成, 耗时 ${Date.now() - startTime}ms`);
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[LETF] 分析失败',
      code: 'LETF_ERROR',
      title: 'LETF analysis failed',
      detail: 'LETF 滑点分析失败',
      endpoint: 'letf',
    },
  ),
);

export default router;
