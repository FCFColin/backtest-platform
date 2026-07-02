/**
 * PCA 路由 — POST /api/pca/analyze
 */
import { Router, type Request, type Response } from 'express';
import type { PCARequest } from '../../shared/types.js';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { validate } from '../middleware/validate.js';
import { pcaAnalyzeSchema } from '../schemas/pca.js';
import {
  executePcaAnalyze,
  validatePcaRequest,
} from '../application/analytics-application-service.js';

const router = Router();

router.post(
  '/analyze',
  validate(pcaAnalyzeSchema),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const body = req.body as PCARequest;
      const cleanTickers = validatePcaRequest(body);

      logger.info(
        `[PCA] 开始分析: tickers=${cleanTickers.join(',')}, range=${body.startDate}~${body.endDate}`,
      );

      const priceData = await fetchHistoryData(cleanTickers, body.startDate, body.endDate);
      const result = executePcaAnalyze(cleanTickers, priceData, body.numComponents);

      logger.info(
        `[PCA] 分析完成: ${result.eigenvalues.length} 个主成分, 耗时 ${Date.now() - startTime}ms`,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('Missing') ||
        message.includes('至少需要') ||
        message.includes('未找到')
      ) {
        sendProblem(res, 422, 'PCA_VALIDATION', 'PCA validation failed', { detail: message });
        return;
      }
      logger.error({ err: error as Error }, '[PCA] 分析失败');
      sendProblem(res, 500, 'PCA_ERROR', 'PCA analysis failed', { detail: 'PCA 分析失败' });
    }
  },
);

export default router;
