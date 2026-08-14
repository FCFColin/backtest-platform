import { Router, type Request, type Response } from 'express';
import type { Portfolio, BacktestParameters } from '@backtest/shared';
import { runAnalysis } from '../application/analysis-orchestrator.js';
import { runMonteCarlo } from '../application/montecarlo-service.js';
import { runOptimization, runEfficientFrontier } from '../application/optimize-service.js';
import {
  extractBacktestSeries,
  backtestCacheKey,
  getBacktestResultCache,
} from '../application/backtest/backtestResultUtils.js';
import { searchTickers } from '../infrastructure/dataFacade.js';
import { SYNTHETIC_TICKERS } from '../infrastructure/dataServices.js';
import { sendProblem } from '../utils/errors.js';
import {
  asyncRouteHandler,
  crudRouteHandler,
  computeRoute,
  resolveAuthorizedJob,
  buildJobStatus,
} from './routeUtils.js';
import { submitQueueJob } from './jobSubmission.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { validate } from '../middleware/miscMiddleware.js';
import {
  portfolioBacktestSchema,
  portfolioSeriesSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
} from '../schemas/backtest.js';

const router = Router();

router.get(
  '/search',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const query = req.query.query as string | undefined;
      const limit = parseInt((req.query.limit as string | undefined) ?? '', 10) || 10;
      if (!query || query.trim().length === 0) {
        sendProblem(res, 422, 'MISSING_PARAMS');
        return;
      }
      const q = query.trim().toLowerCase();
      const results = await searchTickers(q, undefined, (req as AuthenticatedRequest).tenantId);
      const synthetic = SYNTHETIC_TICKERS.filter(
        (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
      ).map((s) => ({ ticker: s.ticker, name: s.name, market: s.category }));
      res.json({ success: true, data: [...results, ...synthetic].slice(0, limit) });
    },
    { logMsg: 'Ticker search error', code: 'SEARCH_ERROR', endpoint: 'backtest-search' },
  ),
);

router.post(
  '/portfolio',
  validate(portfolioBacktestSchema),
  submitQueueJob({
    type: 'portfolio',
    onQueueDown: 'fail-closed',
    statusUrl: (jobId) => `/api/v1/backtest/runs/${jobId}`,
    jobStatus: 'queued',
    metric: 'portfolio',
    queueDownCode: 'SERVICE_TEMPORARILY_UNAVAILABLE',
    retryAfter: '30',
    detail: 'Compute queue temporarily unavailable. Please retry later.',
    logMsg: 'Portfolio backtest error',
    code: 'BACKTEST_ERROR',
    endpoint: 'portfolio-backtest',
  }),
);

router.get(
  '/runs/:jobId',
  crudRouteHandler(
    async (req, res): Promise<void> => {
      const job = await resolveAuthorizedJob(req, res, req.params.jobId!);
      if (!job) return;
      res.json({ success: true, data: buildJobStatus(job, await job.getState()) });
    },
    { logMsg: '[backtestRoutes] 查询异步任务状态失败', code: 'JOB_STATUS_ERROR' },
  ),
);

router.post(
  '/portfolio/series',
  validate(portfolioSeriesSchema),
  asyncRouteHandler(
    async (req, res) => {
      const { portfolios, parameters, series } = req.body as {
        portfolios: Portfolio[];
        parameters: BacktestParameters;
        series: string[];
      };
      const cacheKey = backtestCacheKey(
        portfolios,
        parameters,
        (req as AuthenticatedRequest).tenantId,
      );
      const cached = await getBacktestResultCache(cacheKey);
      if (!cached) {
        sendProblem(res, 404, 'BACKTEST_CACHE_MISS');
        return;
      }
      res.json({ success: true, data: { portfolios: extractBacktestSeries(cached, series) } });
    },
    { logMsg: 'Portfolio series error', code: 'SERIES_ERROR', endpoint: 'portfolio-series' },
  ),
);

router.post(
  '/analysis',
  validate(analysisSchema),
  computeRoute('analysis', 'Analysis error', 'ANALYSIS_ERROR', async (req) => {
    const { tickers, parameters } = req.body as {
      tickers: string[];
      parameters: BacktestParameters;
    };
    return runAnalysis(tickers, parameters);
  }),
);

router.post(
  '/monte-carlo',
  validate(monteCarloSchema),
  computeRoute('monte-carlo', 'Monte Carlo simulation error', 'MONTE_CARLO_ERROR', async (req) => {
    const { portfolio, portfolios, parameters, mcParams } = req.body as {
      portfolio?: Portfolio;
      portfolios?: Portfolio[];
      parameters: BacktestParameters;
      mcParams?: Record<string, unknown>;
    };
    const portfolioList = (portfolios || (portfolio ? [portfolio] : undefined))!;
    return runMonteCarlo(portfolioList, parameters, mcParams);
  }),
);

router.post(
  '/optimize',
  validate(optimizeSchema),
  computeRoute('optimize', 'Optimization error', 'OPTIMIZATION_ERROR', async (req) => {
    const { tickers, objective, constraints, parameters, numIterations } = req.body as {
      tickers: string[];
      objective: 'maxSharpe' | 'minVolatility' | 'maxReturn';
      constraints?: { minWeight?: number; maxWeight?: number };
      parameters: BacktestParameters;
      numIterations?: number;
    };
    return runOptimization(tickers, objective, constraints || {}, parameters, numIterations);
  }),
);

router.post(
  '/efficient-frontier',
  validate(efficientFrontierSchema),
  computeRoute(
    'efficient-frontier',
    'Efficient frontier error',
    'EFFICIENT_FRONTIER_ERROR',
    async (req) => {
      const { tickers, numPoints, parameters } = req.body as {
        tickers: string[];
        numPoints?: number;
        parameters: BacktestParameters;
      };
      return runEfficientFrontier(tickers, parameters, numPoints);
    },
  ),
);

export default router;
