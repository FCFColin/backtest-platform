/**
 * @file 信号分析路由
 * @description 信号分析系列共享后端 API，提供单信号 / 双信号 / 多信号分析能力。
 */

import { Router, type Request, type Response } from 'express';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { validate } from '../middleware/validate.js';
import { signalAnalyzeSchema, signalDualSchema, signalMultiSchema } from '../schemas/signal.js';
import {
  executeSignalAnalyze,
  executeDualSignalAnalyze,
  executeMultiSignalAnalyze,
} from '../application/signal-application-service.js';
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '../../shared/types/signal.js';

const router = Router();

router.post(
  '/analyze',
  validate(signalAnalyzeSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as SignalAnalysisRequest;
      logger.info(
        `[signal/analyze] ticker=${body.ticker} indicator=${body.indicator} period=${body.period}`,
      );

      const history = await fetchHistoryData([body.ticker], body.startDate, body.endDate);
      const result = executeSignalAnalyze(body, history);
      res.json({ success: true, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('未找到')) {
        sendProblem(res, 404, 'NO_PRICE_DATA', 'Price data not found', { detail: message });
        return;
      }
      logger.error({ err: err as Error }, '[signal/analyze] 信号分析失败');
      sendProblem(res, 500, 'SIGNAL_ANALYZE_ERROR', 'Signal analysis failed', {
        detail: '信号分析失败',
      });
    }
  },
);

router.post(
  '/dual',
  validate(signalDualSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as DualSignalConfig;
      const { signal1: cfg1, signal2: cfg2, combinationMethod } = body;
      logger.info(
        `[signal/dual] s1=${cfg1.indicator} s2=${cfg2.indicator} method=${combinationMethod}`,
      );

      const tickers = Array.from(new Set([cfg1.ticker, cfg2.ticker]));
      const history = await fetchHistoryData(tickers, cfg1.startDate, cfg1.endDate);
      const result = executeDualSignalAnalyze(body, history);
      res.json({ success: true, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('未找到')) {
        sendProblem(res, 404, 'NO_PRICE_DATA', 'Price data not found', { detail: message });
        return;
      }
      logger.error({ err: err as Error }, '[signal/dual] 双重信号分析失败');
      sendProblem(res, 500, 'SIGNAL_DUAL_ERROR', 'Dual signal analysis failed', {
        detail: '双信号分析失败',
      });
    }
  },
);

router.post(
  '/multi',
  validate(signalMultiSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as MultiSignalConfig;
      const { signals: configs, aggregationMethod } = body;
      logger.info(`[signal/multi] count=${configs.length} method=${aggregationMethod}`);

      const ticker = configs[0].ticker;
      const history = await fetchHistoryData([ticker], configs[0].startDate, configs[0].endDate);
      const result = executeMultiSignalAnalyze(body, history);
      res.json({ success: true, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('未找到')) {
        sendProblem(res, 404, 'NO_PRICE_DATA', 'Price data not found', { detail: message });
        return;
      }
      logger.error({ err: err as Error }, '[signal/multi] 多信号分析失败');
      sendProblem(res, 500, 'SIGNAL_MULTI_ERROR', 'Multi signal analysis failed', {
        detail: '多信号分析失败',
      });
    }
  },
);

export default router;
