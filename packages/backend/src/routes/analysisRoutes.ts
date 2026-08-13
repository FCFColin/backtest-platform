// 分析类路由合并入口（ADR-042）：letf/calculators/pca/goal-optimizer/factor-regression/tactical/signal
import { Router } from 'express';
import { z } from 'zod';
import type { LETFRequest, PCARequest, GoalOptimizerRequest } from '@backtest/shared/types';
import { logger, sanitizeLog } from '../utils/logger.js';
import { validate } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { factorRegressionResultSchema, calculatorResultSchema } from '../schemas/engineSchemas.js';
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
import { plainCompute } from './routeUtils.js';
import type { DegradedResult } from '../application/backtest-helpers.js';

const analysisRouter = Router();

analysisRouter.post(
  '/pca/analyze',
  ...computeMiddleware(Permission.BACKTEST_RUN),
  validate(pcaAnalyzeSchema),
  plainCompute(
    'PCA',
    'PCA_ERROR',
    async (req) => executePcaAnalyzeWithFetch(req.body as PCARequest),
    {
      startLog: (req) => {
        const cleanTickers = (req.body as PCARequest).tickers
          .map((t: string) => String(t).trim().toUpperCase())
          .filter(Boolean);
        return `[PCA] 开始分析: tickers=${cleanTickers.join(',')}, range=${(req.body as PCARequest).startDate}~${(req.body as PCARequest).endDate}`;
      },
    },
  ),
);

analysisRouter.post(
  '/letf/analyze',
  ...computeMiddleware(Permission.BACKTEST_RUN),
  validate(letfAnalyzeSchema),
  plainCompute(
    'LETF',
    'LETF_ERROR',
    async (req) => executeLetfAnalyzeWithFetch(req.body as LETFRequest),
    {
      startLog: (req) => {
        const body = req.body as LETFRequest;
        return `[LETF] 开始分析: letf=${body.letfTicker}, bench=${body.benchmarkTicker}`;
      },
    },
  ),
);

analysisRouter.post(
  '/goal-optimizer/optimize',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  validate(goalOptimizerSchema),
  plainCompute(
    'GoalOptimizer',
    'GOAL_OPTIMIZER_ERROR',
    async (req) => executeGoalOptimizeWithFetch(req.body as GoalOptimizerRequest),
    {
      startLog: (req) => {
        const request = req.body as GoalOptimizerRequest;
        const tickers = request.assets
          .filter((a) => a.ticker?.trim())
          .map((a) => a.ticker.trim().toUpperCase());
        return `[GoalOptimizer] target=${request.targetAmount}, assets=${tickers.map((t) => sanitizeLog(t)).join(',')}`;
      },
    },
  ),
);

analysisRouter.post(
  '/analysis/factor-regression',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  validate(factorRegressionSchema),
  plainCompute(
    'factor-regression',
    'FR_ERROR',
    async (req) => {
      const { monthlyReturns, ffData, factors, startDate, endDate } = req.body;
      return callEngineStrict(
        '/api/engine/factor-regression',
        {
          monthlyReturns,
          ffData,
          factors: factors || ['mktRF', 'smb', 'hml'],
          startDate: startDate || '',
          endDate: endDate || '',
        },
        factorRegressionResultSchema,
      );
    },
    { startLog: () => '[FactorRegression] 开始回归' },
  ),
);

const VALID_CALC_TYPES = ['cagr', 'swr', 'frontier'];
analysisRouter.post(
  '/calculators/:type',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  validate(calculatorBodySchema),
  plainCompute(
    'calculator',
    'CALC_ERROR',
    async (req) => {
      const { type } = req.params;
      return callEngineStrict(
        '/api/engine/calculators',
        { type, ...req.body },
        calculatorResultSchema[type as keyof typeof calculatorResultSchema],
      );
    },
    {
      startLog: (req) => `[Calculator] 执行 ${req.params.type} 计算`,
      guard: (req, res) => {
        if (!VALID_CALC_TYPES.includes(req.params.type)) {
          sendProblem(res, 422, 'CALC_INVALID_TYPE');
          return false;
        }
        return true;
      },
    },
  ),
);

analysisRouter.post(
  '/tactical/backtest',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  validate(tacticalBacktestSchema),
  plainCompute('tactical-backtest', 'TACTICAL_BACKTEST_ERROR', async (req) =>
    executeTacticalBacktest(req.body),
  ),
);

analysisRouter.post(
  '/tactical/what-if',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  validate(tacticalWhatIfSchema),
  plainCompute('tactical-whatif', 'TACTICAL_WHATIF_ERROR', async (req) => {
    const { tickers, strategy } = req.body;
    return executeTacticalWhatIf(tickers, strategy);
  }),
);

type SignalMode = 'analyze' | 'dual' | 'multi';

const SIGNAL_RUNNERS: Record<SignalMode, (body: never) => Promise<DegradedResult<unknown>>> = {
  analyze: executeSignalAnalyze,
  dual: executeDualSignalAnalyze,
  multi: executeMultiSignalAnalyze,
};

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

function registerSignalRoute(mode: SignalMode, path: string, schema: z.ZodTypeAny) {
  analysisRouter.post(
    path,
    ...computeMiddlewareNoQuota(Permission.SIGNAL_READ),
    validate(schema),
    plainCompute(
      `signal-${mode}`,
      `SIGNAL_${mode.toUpperCase()}_ERROR`,
      async (req) => {
        logSignalContext(mode, req.body as Record<string, unknown>);
        return SIGNAL_RUNNERS[mode](req.body as never);
      },
      { logMsg: `[signal/${mode}] 信号分析失败` },
    ),
  );
}

registerSignalRoute('analyze', '/signal/analyze', signalAnalyzeSchema);
registerSignalRoute('dual', '/signal/dual', signalDualSchema);
registerSignalRoute('multi', '/signal/multi', signalMultiSchema);

export default analysisRouter;
