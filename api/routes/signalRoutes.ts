/**
 * @file 信号分析路由
 * @description 信号分析系列共享后端 API，提供单信号 / 双信号 / 多信号分析能力。
 *
 * 路由层仅负责：参数校验、调用引擎、响应包装
 * 核心算法见 api/engine/signal.ts
 *
 * 路由：
 * - POST /api/signal/analyze — 单信号分析
 * - POST /api/signal/dual   — 双信号分析
 * - POST /api/signal/multi  — 多信号分析
 */

import { Router, type Request, type Response } from 'express';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { toPriceSeries } from '../engine/seriesUtils.js';
import { validate } from '../middleware/validate.js';
import { signalAnalyzeSchema, signalDualSchema, signalMultiSchema } from '../schemas/signal.js';
import {
  analyzeSignal,
  analyzeDualSignal,
  analyzeMultiSignal,
} from '../engine/signal.js';
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '../../shared/types/signal.js';

const router = Router();

/**
 * POST /api/signal/analyze
 * 单信号分析
 * Body: SignalAnalysisRequest
 */
router.post('/analyze', validate(signalAnalyzeSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as SignalAnalysisRequest;
    if (!body || !body.ticker || !body.indicator) {
      res.status(400).json({ success: false, error: '缺少必要参数: ticker, indicator' });
      return;
    }
    logger.info(
      `[signal/analyze] ticker=${body.ticker} indicator=${body.indicator} period=${body.period}`,
    );

    const history = await fetchHistoryData([body.ticker], body.startDate, body.endDate);
    const data = toPriceSeries(history[body.ticker]);
    if (data.length === 0) {
      res.status(404).json({ success: false, error: `未找到 ${body.ticker} 的价格数据` });
      return;
    }

    const result = analyzeSignal(body, data);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error({ err: err as Error }, '[signal/analyze] 信号分析失败');
    res.status(500).json({ success: false, error: '信号分析失败' });
  }
});

/**
 * POST /api/signal/dual
 * 双信号分析
 * Body: DualSignalConfig
 */
router.post('/dual', validate(signalDualSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as DualSignalConfig;
    if (!body || !body.signal1 || !body.signal2 || !body.combinationMethod) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数: signal1, signal2, combinationMethod',
      });
      return;
    }
    const { signal1: cfg1, signal2: cfg2, combinationMethod } = body;
    logger.info(
      `[signal/dual] s1=${cfg1.indicator} s2=${cfg2.indicator} method=${combinationMethod}`,
    );

    // 获取价格数据（支持两信号不同标的，分别取数）
    const tickers = Array.from(new Set([cfg1.ticker, cfg2.ticker]));
    const history = await fetchHistoryData(tickers, cfg1.startDate, cfg1.endDate);
    const data1 = toPriceSeries(history[cfg1.ticker]);
    const data2 = toPriceSeries(history[cfg2.ticker]);

    if (data1.length === 0 || data2.length === 0) {
      res.status(404).json({ success: false, error: '未找到价格数据' });
      return;
    }

    const result = analyzeDualSignal(cfg1, cfg2, data1, data2, combinationMethod);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error({ err: err as Error }, '[signal/dual] 双重信号分析失败');
    res.status(500).json({ success: false, error: '双信号分析失败' });
  }
});

/**
 * POST /api/signal/multi
 * 多信号分析
 * Body: MultiSignalConfig（各 SignalAnalysisRequest 共享同一 ticker 与时间范围）
 */
router.post('/multi', validate(signalMultiSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as MultiSignalConfig;
    if (!body || !Array.isArray(body.signals) || body.signals.length === 0 || !body.aggregationMethod) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数: signals, aggregationMethod',
      });
      return;
    }
    const { signals: configs, aggregationMethod, weights } = body;
    logger.info(
      `[signal/multi] count=${configs.length} method=${aggregationMethod}`,
    );

    // 统一使用第一个信号的 ticker 与时间范围获取价格数据
    const ticker = configs[0].ticker;
    const startDate = configs[0].startDate;
    const endDate = configs[0].endDate;
    const history = await fetchHistoryData([ticker], startDate, endDate);
    const data = toPriceSeries(history[ticker]);
    if (data.length === 0) {
      res.status(404).json({ success: false, error: '未找到价格数据' });
      return;
    }

    const result = analyzeMultiSignal(configs, data, aggregationMethod, weights);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error({ err: err as Error }, '[signal/multi] 多信号分析失败');
    res.status(500).json({ success: false, error: '多信号分析失败' });
  }
});

export default router;
