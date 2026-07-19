/**
 * @file 信号分析路由
 * @description 信号分析系列共享后端 API，提供单信号 / 双信号 / 多信号分析能力。
 */

import { Router, type Request, type Response } from 'express';
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '@backtest/shared/types/signal';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { signalAnalyzeSchema, signalDualSchema, signalMultiSchema } from '../schemas/signal.js';
import {
  executeSignalAnalyze,
  executeDualSignalAnalyze,
  executeMultiSignalAnalyze,
} from '../services/signal-orchestrator.js';
import { asyncRouteHandler } from './routeUtils.js';

const router = Router();

router.post(
  '/analyze',
  validate(signalAnalyzeSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const body = req.body as SignalAnalysisRequest;
      logger.info(
        `[signal/analyze] ticker=${body.ticker} indicator=${body.indicator} period=${body.period}`,
      );

      const result = await executeSignalAnalyze(body);
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[signal/analyze] 信号分析失败',
      code: 'SIGNAL_ANALYZE_ERROR',
      title: 'Signal analysis failed',
      detail: '信号分析失败',
      endpoint: 'signal-analyze',
    },
  ),
);

router.post(
  '/dual',
  validate(signalDualSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const body = req.body as DualSignalConfig;
      const { signal1: cfg1, signal2: cfg2, combinationMethod } = body;
      logger.info(
        `[signal/dual] s1=${cfg1.indicator} s2=${cfg2.indicator} method=${combinationMethod}`,
      );

      const result = await executeDualSignalAnalyze(body);
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[signal/dual] 双重信号分析失败',
      code: 'SIGNAL_DUAL_ERROR',
      title: 'Dual signal analysis failed',
      detail: '双信号分析失败',
      endpoint: 'signal-dual',
    },
  ),
);

router.post(
  '/multi',
  validate(signalMultiSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const body = req.body as MultiSignalConfig;
      const { signals: configs, aggregationMethod } = body;
      logger.info(`[signal/multi] count=${configs.length} method=${aggregationMethod}`);

      const result = await executeMultiSignalAnalyze(body);
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[signal/multi] 多信号分析失败',
      code: 'SIGNAL_MULTI_ERROR',
      title: 'Multi signal analysis failed',
      detail: '多信号分析失败',
      endpoint: 'signal-multi',
    },
  ),
);

export default router;
