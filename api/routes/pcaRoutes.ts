/**
 * PCA（主成分分析）路由
 * POST /api/pca/analyze - 对多个资产的收益率序列进行主成分分析
 *
 * 路由层仅负责：参数校验、调用引擎、响应包装
 * 核心算法见 api/engine/pca.ts
 */

import { Router, type Request, type Response } from 'express';
import type { PCARequest } from '../../shared/types.js';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { pcaAnalyzeSchema } from '../schemas/pca.js';
import { performPCA } from '../engine/pca.js';

const router = Router();

/**
 * POST /api/pca/analyze
 * Body: PCARequest { tickers, startDate, endDate, numComponents? }
 */
router.post('/analyze', validate(pcaAnalyzeSchema), async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const { tickers, startDate, endDate, numComponents } = req.body as PCARequest;

    // 参数校验
    if (!Array.isArray(tickers) || tickers.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid field: tickers (must be a non-empty array)',
      });
      return;
    }
    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: startDate, endDate',
      });
      return;
    }

    // 过滤空字符串并去重
    const cleanTickers = Array.from(
      new Set(tickers.map((t) => String(t).trim().toUpperCase()).filter(Boolean)),
    );
    if (cleanTickers.length < 2) {
      res.status(400).json({
        success: false,
        error: 'PCA 分析至少需要 2 个资产',
      });
      return;
    }

    logger.info(`[PCA] 开始分析: tickers=${cleanTickers.join(',')}, range=${startDate}~${endDate}, nComponents=${numComponents ?? 'auto'}`);

    // 获取价格数据
    const priceData = await fetchHistoryData(cleanTickers, startDate, endDate);

    // 检查数据有效性
    const missingTickers = cleanTickers.filter(
      (t) => !priceData[t] || Object.keys(priceData[t]).length === 0,
    );
    if (missingTickers.length > 0) {
      res.status(400).json({
        success: false,
        error: `以下资产未找到价格数据: ${missingTickers.join(', ')}`,
      });
      return;
    }

    // 调用引擎模块
    const result = performPCA(cleanTickers, priceData, numComponents);

    const elapsed = Date.now() - startTime;
    logger.info(`[PCA] 分析完成: ${result.eigenvalues.length} 个主成分, 耗时 ${elapsed}ms`);

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[PCA] 分析失败');
    res.status(500).json({
      success: false,
      error: 'PCA 分析失败',
    });
  }
});

export default router;
