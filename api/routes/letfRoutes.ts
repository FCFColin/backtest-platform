/**
 * @file LETF Slippage（杠杆 ETF 滑点）路由
 * @description 分析杠杆 ETF 相对基准指数的滑点拖累
 * @route POST /api/letf/analyze
 *
 * 路由层仅负责：参数校验、调用引擎、响应包装
 * 核心算法见 api/engine/letf.ts
 */

import { Router, type Request, type Response } from 'express';
import type { LETFRequest } from '../../shared/types/letf.js';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { toSortedSeries } from '../engine/seriesUtils.js';
import { validate } from '../middleware/validate.js';
import { letfAnalyzeSchema } from '../schemas/letf.js';
import { analyzeLetfSlippage } from '../engine/letf.js';

const router = Router();

/**
 * POST /api/letf/analyze
 * Body: LETFRequest { letfTicker, benchmarkTicker, leverage, startDate, endDate }
 */
router.post('/analyze', validate(letfAnalyzeSchema), async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const { letfTicker, benchmarkTicker, leverage, startDate, endDate } =
      req.body as LETFRequest;

    // 参数校验
    if (!letfTicker || !benchmarkTicker) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数: letfTicker, benchmarkTicker',
      });
      return;
    }
    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数: startDate, endDate',
      });
      return;
    }
    const lev = Number(leverage);
    if (!Number.isFinite(lev) || lev <= 0) {
      res.status(400).json({
        success: false,
        error: 'leverage 必须为正数',
      });
      return;
    }

    const cleanLetf = String(letfTicker).trim().toUpperCase();
    const cleanBench = String(benchmarkTicker).trim().toUpperCase();

    logger.info(
      `[LETF] 开始分析: letf=${cleanLetf}, benchmark=${cleanBench}, leverage=${lev}x, range=${startDate}~${endDate}`,
    );

    // 获取价格数据
    const priceData = await fetchHistoryData(
      [cleanLetf, cleanBench],
      startDate,
      endDate,
    );

    if (!priceData[cleanLetf] || Object.keys(priceData[cleanLetf]).length === 0) {
      res.status(400).json({
        success: false,
        error: `未找到杠杆 ETF ${cleanLetf} 的价格数据`,
      });
      return;
    }
    if (!priceData[cleanBench] || Object.keys(priceData[cleanBench]).length === 0) {
      res.status(400).json({
        success: false,
        error: `未找到基准指数 ${cleanBench} 的价格数据`,
      });
      return;
    }

    const letfSeries = toSortedSeries(priceData[cleanLetf]);
    const benchSeries = toSortedSeries(priceData[cleanBench]);

    // 调用引擎模块
    const result = analyzeLetfSlippage(letfSeries, benchSeries, lev);

    const elapsed = Date.now() - startTime;
    logger.info(
      `[LETF] 分析完成: ${result.slippageCurve.length} 个数据点, 年化拖累=${(result.annualDecay * 100).toFixed(2)}%, 耗时 ${elapsed}ms`,
    );

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[LETF] 分析失败');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'LETF 滑点分析失败',
    });
  }
});

export default router;
