/**
 * PCA 路由 — POST /api/pca/analyze
 */
import { Router, type Request, type Response } from 'express';
import type { PCARequest } from '@backtest/shared/types';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { pcaAnalyzeSchema } from '../schemas/pca.js';
import { executePcaAnalyzeWithFetch } from '../services/analysis-orchestrator.js';
import { asyncRouteHandler } from './routeUtils.js';

const router = Router();

router.post(
  '/analyze',
  validate(pcaAnalyzeSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const body = req.body as PCARequest;
      const cleanTickers = body.tickers
        .map((t: string) => String(t).trim().toUpperCase())
        .filter(Boolean);
      logger.info(
        `[PCA] 开始分析: tickers=${cleanTickers.join(',')}, range=${body.startDate}~${body.endDate}`,
      );

      const result = await executePcaAnalyzeWithFetch(body);

      logger.info(
        `[PCA] 分析完成: ${result.eigenvalues.length} 个主成分, 耗时 ${Date.now() - startTime}ms`,
      );
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[PCA] 分析失败',
      code: 'PCA_ERROR',
      title: 'PCA analysis failed',
      detail: 'PCA 分析失败',
      endpoint: 'pca',
    },
  ),
);

export default router;
