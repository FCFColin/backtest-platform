/**
 * 回测路由 — 纯 HTTP 适配层（薄路由模式）：请求解析 → application 层 → 响应格式化。
 */
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { Portfolio, BacktestParameters } from '@backtest/shared';
import { runAnalysis } from '../application/analysis-orchestrator.js';
import type { Warning } from '../application/backtest-helpers.js';
import { runMonteCarlo } from '../application/montecarlo-service.js';
import { runOptimization, runEfficientFrontier } from '../application/optimize-service.js';
import {
  extractBacktestSeries,
  backtestCacheKey,
  getBacktestResultCache,
} from '../application/backtest/backtestResultUtils.js';
import { searchTickers } from '../infrastructure/dataFacade.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { recordBacktestRequest } from '../utils/metrics.js';
import { asyncRouteHandler, crudRouteHandler, ownerOf } from './routeUtils.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import {
  backtestQueue,
  type BacktestJobData,
  type BacktestJobResult,
} from '../queues/backtestQueue.js';
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

function buildBacktestResponse(
  data: unknown,
  warnings: (Warning | string)[] = [],
  dateRange?: unknown,
): Record<string, unknown> {
  const response: Record<string, unknown> = { success: true, data };
  if (warnings.length > 0)
    response.warnings = warnings.map((w: Warning | string): Warning =>
      typeof w === 'string' ? { code: 'WARNING', message: w } : w,
    );
  if (dateRange) response.dateRange = dateRange;
  return response;
}

function computeRoute(
  metric: string,
  logMsg: string,
  code: string,
  fn: (req: Request) => Promise<{
    data: unknown;
    warnings?: (Warning | string)[];
    dateRange?: unknown;
  }>,
): RequestHandler {
  return asyncRouteHandler(
    async (req, res) => {
      const startTime = Date.now();
      const { data, warnings, dateRange } = await fn(req);
      recordBacktestRequest(metric, 'sync', 'success');
      res.json(buildBacktestResponse(data, warnings, dateRange));
      logger.info(`[backtest] ${metric} completed in ${Date.now() - startTime}ms`);
    },
    { logMsg, code, endpoint: metric },
  );
}

router.get(
  '/search',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const query = req.query.query as string;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      if (!query || query.trim().length === 0) {
        sendProblem(res, 422, 'MISSING_PARAMS');
        return;
      }
      const results = await searchTickers(
        query.trim(),
        undefined,
        (req as AuthenticatedRequest).tenantId,
      );
      res.json({ success: true, data: results.slice(0, limit) });
    },
    { logMsg: 'Ticker search error', code: 'SEARCH_ERROR', endpoint: 'backtest-search' },
  ),
);

router.post(
  '/portfolio',
  validate(portfolioBacktestSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { portfolios, parameters } = req.body as {
        portfolios: Portfolio[];
        parameters: BacktestParameters;
      };
      const authReq = req as AuthenticatedRequest;
      try {
        const job = await backtestQueue.add('portfolio', {
          type: 'portfolio',
          payload: { portfolios, parameters },
          userId: authReq.user?.sub,
          tenantId: authReq.tenantId,
          ownerUserId: ownerOf(authReq),
        } as BacktestJobData);
        res.status(202).json({
          success: true,
          data: { jobId: job.id, status: 'queued', statusUrl: `/api/v1/backtest/runs/${job.id}` },
        });
        recordBacktestRequest('portfolio', 'async', 'success');
      } catch (queueError) {
        logger.error(
          { err: (queueError as Error).message },
          '[backtest] BullMQ 队列不可用，fail-closed 返回 503',
        );
        recordBacktestRequest('portfolio', 'async', 'queue_error');
        sendProblem(
          res,
          503,
          'SERVICE_TEMPORARILY_UNAVAILABLE',
          'Service temporarily unavailable',
          {
            detail: 'Compute queue temporarily unavailable. Please retry later.',
            headers: { 'Retry-After': '30' },
          },
        );
      }
    },
    { logMsg: 'Portfolio backtest error', code: 'BACKTEST_ERROR', endpoint: 'portfolio-backtest' },
  ),
);

function mapJobState(bullmqState: string): 'queued' | 'running' | 'completed' | 'failed' {
  if (bullmqState === 'completed') return 'completed';
  if (bullmqState === 'failed') return 'failed';
  if (bullmqState === 'delayed') return 'queued';
  return 'running';
}

router.get(
  '/runs/:jobId',
  crudRouteHandler(
    // eslint-disable-next-line complexity
    async (req, res): Promise<void> => {
      const jobId = req.params.jobId;
      if (!jobId) {
        sendProblem(res, 400, 'INVALID_ID');
        return;
      }
      const job = await backtestQueue.getJob(jobId);
      if (!job) {
        sendProblem(res, 404, 'JOB_NOT_FOUND');
        return;
      }
      const requester = req.user;
      if (requester) {
        const ownerId = job.data?.userId;
        const jobTenant = job.data?.tenantId;
        const hasOwnership =
          (ownerId !== undefined && ownerId === requester.sub) || requester.role === 'admin';
        const passesTenantCheck =
          !jobTenant || jobTenant === req.tenantId || requester.platform_admin === true;
        if (!hasOwnership || !passesTenantCheck) {
          sendProblem(res, 404, 'JOB_NOT_FOUND');
          return;
        }
      }
      const status = mapJobState(await job.getState());
      const progress = typeof job.progress === 'number' ? job.progress : 0;
      const data: Record<string, unknown> = { jobId, status, progress };
      if (status === 'completed' && job.returnvalue) {
        const returnValue = job.returnvalue as BacktestJobResult;
        if (returnValue.status === 'completed' && returnValue.result)
          data.result = returnValue.result;
        else if (returnValue.status === 'failed') data.error = returnValue.error;
      } else if (status === 'failed') data.error = job.failedReason || 'Job execution failed';
      res.json({ success: true, data });
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
    const result = (await runAnalysis(tickers, parameters)) as Record<string, unknown> & {
      warnings?: Warning[];
      dateRange?: unknown;
    };
    const { warnings, dateRange, ...data } = result;
    return { data, warnings, dateRange };
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
      const { tickers, numPoints, parameters, riskFreeRate } = req.body as {
        tickers: string[];
        numPoints?: number;
        parameters: BacktestParameters;
        riskFreeRate?: number;
      };
      return runEfficientFrontier(tickers, parameters, numPoints, riskFreeRate);
    },
  ),
);

export default router;
