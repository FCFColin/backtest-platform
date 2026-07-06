/**
 * LETF 滑点路由 — POST /api/letf/analyze
 */
import { Router, type Request, type Response } from 'express';
import type { LETFRequest } from '@backtest/shared/types/letf';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { validate } from '../middleware/validate.js';
import { letfAnalyzeSchema } from '../schemas/letf.js';
import { executeLetfAnalyze } from '../application/analytics-application-service.js';

const router = Router();

router.post(
  '/analyze',
  validate(letfAnalyzeSchema),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const body = req.body as LETFRequest;

      const cleanLetf = String(body.letfTicker).trim().toUpperCase();
      const cleanBench = String(body.benchmarkTicker).trim().toUpperCase();

      const priceData = await fetchHistoryData(
        [cleanLetf, cleanBench],
        body.startDate,
        body.endDate,
      );
      const result = executeLetfAnalyze(body, priceData);

      logger.info(`[LETF] 分析完成, 耗时 ${Date.now() - startTime}ms`);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('未找到')) {
        sendProblem(res, 422, 'NO_PRICE_DATA', 'Price data not found', { detail: message });
        return;
      }
      logger.error({ err: error as Error }, '[LETF] 分析失败');
      sendProblem(res, 500, 'LETF_ERROR', 'LETF analysis failed', {
        detail: message || 'LETF 滑点分析失败',
      });
    }
  },
);

export default router;
