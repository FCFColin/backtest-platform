// 分析类路由合并入口（ADR-042）：letf/calculators/pca/goal-optimizer/factor-regression/tactical/signal
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { LETFRequest, PCARequest, GoalOptimizerRequest } from '@backtest/shared/types';
import { logger, sanitizeLog } from '../utils/logger.js';
import { validate } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { computeMiddleware, computeMiddlewareNoQuota } from '../middleware/middlewareChains.js';
import { Permission } from '../middleware/rbac.js';
import {
  pcaAnalyzeSchema,
  letfAnalyzeSchema,
  goalOptimizerSchema,
  factorRegressionSchema,
  calculatorBodySchema,
  signalAnalyzeSchema,
  signalDualSchema,
  signalMultiSchema,
} from '../schemas/analysisSchemas.js';
import { tacticalBacktestSchema, tacticalWhatIfSchema } from '../schemas/tactical.js';
import {
  executeLetfAnalyzeWithFetch,
  executePcaAnalyzeWithFetch,
  executeGoalOptimizeWithFetch,
} from '../application/analysis-orchestrator.js';
import {
  executeTacticalBacktest,
  executeTacticalWhatIf,
} from '../application/tactical-application-service.js';
import {
  executeSignalAnalyze,
  executeDualSignalAnalyze,
  executeMultiSignalAnalyze,
} from '../application/signal-orchestrator.js';
import { asyncRouteHandler } from './routeUtils.js';

const analysisRouter = Router();

/** 分析类端点统一骨架：开始日志 → 执行 → 完成耗时日志 → 统一响应（消除 3 处 WithFetch 端点重复样板）。 */
function timedCompute(
  metric: string,
  code: string,
  startLog: (req: Request) => string,
  fn: (req: Request) => Promise<unknown>,
) {
  return asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      logger.info(startLog(req));
      const result = await fn(req);
      logger.info(`[${metric}] 完成, 耗时 ${Date.now() - startTime}ms`);
      res.json({ success: true, data: result });
    },
    { logMsg: `[${metric}] 失败`, code, endpoint: metric },
  );
}

analysisRouter.post(
  '/pca/analyze',
  ...computeMiddleware(Permission.BACKTEST_RUN),
  validate(pcaAnalyzeSchema),
  timedCompute(
    'PCA',
    'PCA_ERROR',
    (req) => {
      const cleanTickers = (req.body as PCARequest).tickers
        .map((t: string) => String(t).trim().toUpperCase())
        .filter(Boolean);
      return `[PCA] 开始分析: tickers=${cleanTickers.join(',')}, range=${(req.body as PCARequest).startDate}~${(req.body as PCARequest).endDate}`;
    },
    async (req) => executePcaAnalyzeWithFetch(req.body as PCARequest),
  ),
);

analysisRouter.post(
  '/letf/analyze',
  ...computeMiddleware(Permission.BACKTEST_RUN),
  validate(letfAnalyzeSchema),
  timedCompute(
    'LETF',
    'LETF_ERROR',
    (req) => {
      const body = req.body as LETFRequest;
      return `[LETF] 开始分析: letf=${body.letfTicker}, bench=${body.benchmarkTicker}`;
    },
    async (req) => executeLetfAnalyzeWithFetch(req.body as LETFRequest),
  ),
);

analysisRouter.post(
  '/goal-optimizer/optimize',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  validate(goalOptimizerSchema),
  timedCompute(
    'GoalOptimizer',
    'GOAL_OPTIMIZER_ERROR',
    (req) => {
      const request = req.body as GoalOptimizerRequest;
      const tickers = request.assets
        .filter((a) => a.ticker?.trim())
        .map((a) => a.ticker.trim().toUpperCase());
      return `[GoalOptimizer] target=${request.targetAmount}, assets=${tickers.map((t) => sanitizeLog(t)).join(',')}`;
    },
    async (req) => executeGoalOptimizeWithFetch(req.body as GoalOptimizerRequest),
  ),
);

analysisRouter.post(
  '/analysis/factor-regression',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  validate(factorRegressionSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { monthlyReturns, ffData, factors, startDate, endDate } = req.body;

      logger.info('[FactorRegression] 开始回归');
      const result = await callEngineStrict('/api/engine/factor-regression', {
        monthlyReturns,
        ffData,
        factors: factors || ['mktRF', 'smb', 'hml'],
        startDate: startDate || '',
        endDate: endDate || '',
      });
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[FactorRegression] 失败',
      code: 'FR_ERROR',
      endpoint: 'factor-regression',
    },
  ),
);

const VALID_CALC_TYPES = ['cagr', 'swr', 'frontier'];
analysisRouter.post(
  '/calculators/:type',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  validate(calculatorBodySchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { type } = req.params;
      const body = req.body;

      if (!VALID_CALC_TYPES.includes(type)) {
        sendProblem(res, 422, 'CALC_INVALID_TYPE');
        return;
      }

      logger.info(`[Calculator] 执行 ${type} 计算`);
      const result = await callEngineStrict('/api/engine/calculators', { type, ...body });
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[Calculators] 失败',
      code: 'CALC_ERROR',
      endpoint: 'calculator',
    },
  ),
);

analysisRouter.post(
  '/tactical/backtest',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  validate(tacticalBacktestSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const body = req.body;

      const data = await executeTacticalBacktest(body);
      res.json({ success: true, data });
      logger.info(`[tactical] 回测完成，耗时 ${Date.now() - startTime}ms`);
    },
    {
      logMsg: '[tactical] 回测失败',
      code: 'TACTICAL_BACKTEST_ERROR',
      endpoint: 'tactical-backtest',
    },
  ),
);

analysisRouter.post(
  '/tactical/what-if',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  validate(tacticalWhatIfSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { tickers, strategy } = req.body;
      const results = await executeTacticalWhatIf(tickers, strategy);
      res.json({ success: true, data: results });
    },
    {
      logMsg: '[tactical] what-if 查询失败',
      code: 'TACTICAL_WHATIF_ERROR',
      endpoint: 'tactical-whatif',
    },
  ),
);

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

const ERROR_CONFIGS: Record<SignalMode, { logMsg: string; code: string; endpoint: string }> = {
  analyze: {
    logMsg: '[signal/analyze] 信号分析失败',
    code: 'SIGNAL_ANALYZE_ERROR',
    endpoint: 'signal-analyze',
  },
  dual: {
    logMsg: '[signal/dual] 双重信号分析失败',
    code: 'SIGNAL_DUAL_ERROR',
    endpoint: 'signal-dual',
  },
  multi: {
    logMsg: '[signal/multi] 多信号分析失败',
    code: 'SIGNAL_MULTI_ERROR',
    endpoint: 'signal-multi',
  },
};

function registerSignalRoute(mode: SignalMode, path: string, schema: z.ZodTypeAny) {
  analysisRouter.post(
    path,
    ...computeMiddlewareNoQuota(Permission.SIGNAL_READ),
    validate(schema),
    asyncRouteHandler(async (req: Request, res: Response): Promise<void> => {
      logSignalContext(mode, req.body as Record<string, unknown>);
      const result = await runSignalAnalysis(mode, req.body);
      res.json({ success: true, data: result });
    }, ERROR_CONFIGS[mode]),
  );
}

registerSignalRoute('analyze', '/signal/analyze', signalAnalyzeSchema);
registerSignalRoute('dual', '/signal/dual', signalDualSchema);
registerSignalRoute('multi', '/signal/multi', signalMultiSchema);

export default analysisRouter;
