import { z } from 'zod';
import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { signalAnalyzeSchema, signalDualSchema, signalMultiSchema } from '../schemas/signal.js';
import {
  executeSignalAnalyze,
  executeDualSignalAnalyze,
  executeMultiSignalAnalyze,
} from '../application/signal-orchestrator.js';
import { asyncRouteHandler } from './routeUtils.js';

const router = Router();

type SignalMode = 'analyze' | 'dual' | 'multi';

function runSignalAnalysis(mode: SignalMode, body: unknown): Promise<unknown> {
  switch (mode) {
    case 'analyze':
      return executeSignalAnalyze(body as never);
    case 'dual':
      return executeDualSignalAnalyze(body as never);
    case 'multi':
      return executeMultiSignalAnalyze(body as never);
  }
}

function logSignalContext(mode: SignalMode, body: Record<string, unknown>): void {
  switch (mode) {
    case 'analyze':
      logger.info(
        `[signal/analyze] ticker=${body.ticker} indicator=${body.indicator} period=${body.period}`,
      );
      break;
    case 'dual': {
      const cfg1 = (body as { signal1?: { indicator?: string } }).signal1;
      const cfg2 = (body as { signal2?: { indicator?: string } }).signal2;
      logger.info(
        `[signal/dual] s1=${cfg1?.indicator} s2=${cfg2?.indicator} method=${body.combinationMethod}`,
      );
      break;
    }
    case 'multi': {
      const configs = (body as { signals?: unknown[] }).signals;
      logger.info(`[signal/multi] count=${configs?.length} method=${body.aggregationMethod}`);
      break;
    }
  }
}

const ERROR_CONFIGS: Record<
  SignalMode,
  { logMsg: string; code: string; title: string; detail: string; endpoint: string }
> = {
  analyze: {
    logMsg: '[signal/analyze] 信号分析失败',
    code: 'SIGNAL_ANALYZE_ERROR',
    title: 'Signal analysis failed',
    detail: '信号分析失败',
    endpoint: 'signal-analyze',
  },
  dual: {
    logMsg: '[signal/dual] 双重信号分析失败',
    code: 'SIGNAL_DUAL_ERROR',
    title: 'Dual signal analysis failed',
    detail: '双信号分析失败',
    endpoint: 'signal-dual',
  },
  multi: {
    logMsg: '[signal/multi] 多信号分析失败',
    code: 'SIGNAL_MULTI_ERROR',
    title: 'Multi signal analysis failed',
    detail: '多信号分析失败',
    endpoint: 'signal-multi',
  },
};

function registerSignalRoute(mode: SignalMode, path: string, schema: z.ZodTypeAny) {
  router.post(
    path,
    validate(schema),
    asyncRouteHandler(async (req: Request, res: Response): Promise<void> => {
      logSignalContext(mode, req.body as Record<string, unknown>);
      const result = await runSignalAnalysis(mode, req.body);
      res.json({ success: true, data: result });
    }, ERROR_CONFIGS[mode]),
  );
}

registerSignalRoute('analyze', '/analyze', signalAnalyzeSchema);
registerSignalRoute('dual', '/dual', signalDualSchema);
registerSignalRoute('multi', '/multi', signalMultiSchema);

export default router;
