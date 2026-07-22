/**
 * 回测路由 — 纯 HTTP 适配层（薄路由模式）。
 *
 * 路由只负责：请求解析 → 调用 application 层 → 响应格式化。
 * 所有校验、数据准备、引擎调用编排逻辑在 application 层中。
 *
 * POST /api/backtest/portfolio        — 组合回测
 * POST /api/backtest/portfolio/series — 从缓存补全 tab 序列
 * POST /api/backtest/analysis         — 资产分析
 * POST /api/backtest/monte-carlo      — 蒙特卡洛模拟
 * POST /api/backtest/optimize         — 组合优化
 * POST /api/backtest/efficient-frontier — 有效前沿
 * GET  /api/backtest/search           — 搜索 ticker
 */

import { Router, type Request, type Response } from 'express';
import type { Portfolio, BacktestParameters } from '@backtest/shared';
import { runPortfolioBacktest } from '../application/backtest-service.js';
import { runAnalysis } from '../application/analysis-orchestrator.js';
import { runMonteCarlo } from '../application/montecarlo-service.js';
import { runOptimization, runEfficientFrontier } from '../application/optimize-service.js';
import { extractBacktestSeries } from '../application/backtest/compressBacktestResult.js';
import {
  backtestCacheKey,
  getBacktestResultCache,
} from '../application/backtest/backtestResultCache.js';
import { searchTickers } from '../infrastructure/dataFacade.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { recordBacktestRequest } from '../utils/metrics.js';
import { asyncRouteHandler } from './routeUtils.js';
import type { AuthenticatedRequest } from '../middleware/authTypes.js';
import { validate } from '../middleware/validate.js';
import {
  portfolioBacktestSchema,
  portfolioSeriesSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
} from '../schemas/backtest.js';

const router = Router();

// ---------------------------------------------------------------------------
// 搜索 ticker
// ---------------------------------------------------------------------------

router.get(
  '/search',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const query = req.query.query as string;
      const limit = parseInt(req.query.limit as string, 10) || 10;

      if (!query || query.trim().length === 0) {
        sendProblem(res, 422, 'MISSING_PARAMS', 'Missing required parameter', {
          detail: 'Missing required query parameter: query',
        });
        return;
      }

      const results = await searchTickers(query.trim());
      res.json({ success: true, data: results.slice(0, limit) });
    },
    {
      logMsg: 'Ticker search error',
      code: 'SEARCH_ERROR',
      title: 'Search failed',
      detail: 'Failed to search tickers',
      endpoint: 'backtest-search',
    },
  ),
);

// ---------------------------------------------------------------------------
// 组合回测 — 编排逻辑在 backtest-service.runPortfolioBacktest 中
// ---------------------------------------------------------------------------

router.post(
  '/portfolio',
  validate(portfolioBacktestSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const { portfolios, parameters } = req.body as {
        portfolios: Portfolio[];
        parameters: BacktestParameters;
      };
      const authReq = req as AuthenticatedRequest;

      const { result, warnings } = await runPortfolioBacktest({
        portfolios,
        parameters,
        tenantId: authReq.tenantId,
        ownerUserId: authReq.user?.sub,
      });

      const response: Record<string, unknown> = {
        success: true,
        data: result,
      };
      if (warnings.length > 0) {
        response.warnings = warnings;
      }
      res.json(response);
      logger.info(`[backtest] Portfolio backtest completed in ${Date.now() - startTime}ms`);
    },
    {
      logMsg: 'Portfolio backtest error',
      code: 'BACKTEST_ERROR',
      title: 'Backtest failed',
      detail: 'Failed to run portfolio backtest',
      endpoint: 'portfolio-backtest',
    },
  ),
);

// ---------------------------------------------------------------------------
// 从 LRU 缓存补全 tab 序列
// ---------------------------------------------------------------------------

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
        sendProblem(res, 404, 'BACKTEST_CACHE_MISS', 'Cache miss', {
          detail: '回测缓存已过期，请重新运行回测',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          portfolios: extractBacktestSeries(cached, series),
        },
      });
    },
    {
      logMsg: 'Portfolio series error',
      code: 'SERIES_ERROR',
      title: 'Series fetch failed',
      detail: 'Failed to fetch backtest series',
      endpoint: 'portfolio-series',
    },
  ),
);

// ---------------------------------------------------------------------------
// 资产分析
// ---------------------------------------------------------------------------

router.post(
  '/analysis',
  validate(analysisSchema),
  asyncRouteHandler(
    async (req, res) => {
      const { tickers, parameters } = req.body as {
        tickers: string[];
        parameters: BacktestParameters;
      };

      const result = await runAnalysis(tickers, parameters);
      recordBacktestRequest('analysis', 'sync', 'success');
      res.json({ success: true, data: result });
    },
    {
      logMsg: 'Analysis error',
      code: 'ANALYSIS_ERROR',
      title: 'Analysis failed',
      detail: 'Failed to run analysis',
      endpoint: 'analysis',
    },
  ),
);

// ---------------------------------------------------------------------------
// 蒙特卡洛模拟
// ---------------------------------------------------------------------------

router.post(
  '/monte-carlo',
  validate(monteCarloSchema),
  asyncRouteHandler(
    async (req, res) => {
      const startTime = Date.now();
      const { portfolio, portfolios, parameters, mcParams } = req.body as {
        portfolio?: Portfolio;
        portfolios?: Portfolio[];
        parameters: BacktestParameters;
        mcParams?: object;
      };

      const portfolioList = (portfolios || (portfolio ? [portfolio] : undefined))!;

      const result = await runMonteCarlo(portfolioList, parameters, mcParams);

      recordBacktestRequest('monte-carlo', 'sync', 'success');
      res.json({ success: true, data: result });
      logger.info(`[backtest] Monte Carlo completed in ${Date.now() - startTime}ms`);
    },
    {
      logMsg: 'Monte Carlo simulation error',
      code: 'MONTE_CARLO_ERROR',
      title: 'Monte Carlo failed',
      detail: 'Failed to run Monte Carlo simulation',
      endpoint: 'monte-carlo',
    },
  ),
);

// ---------------------------------------------------------------------------
// 组合优化
// ---------------------------------------------------------------------------

router.post(
  '/optimize',
  validate(optimizeSchema),
  asyncRouteHandler(
    async (req, res) => {
      const startTime = Date.now();
      const { tickers, objective, constraints, parameters, numIterations } = req.body as {
        tickers: string[];
        objective: 'maxSharpe' | 'minVolatility' | 'maxReturn';
        constraints?: { minWeight?: number; maxWeight?: number };
        parameters: BacktestParameters;
        numIterations?: number;
      };

      const result = await runOptimization(
        tickers,
        objective,
        constraints || {},
        parameters,
        numIterations,
      );

      logger.info(`[backtest] Optimization completed in ${Date.now() - startTime}ms`);
      recordBacktestRequest('optimize', 'sync', 'success');
      res.json({ success: true, data: result });
    },
    {
      logMsg: 'Optimization error',
      code: 'OPTIMIZATION_ERROR',
      title: 'Optimization failed',
      detail: 'Failed to optimize portfolio',
      endpoint: 'optimize',
    },
  ),
);

// ---------------------------------------------------------------------------
// 有效前沿
// ---------------------------------------------------------------------------

router.post(
  '/efficient-frontier',
  validate(efficientFrontierSchema),
  asyncRouteHandler(
    async (req, res) => {
      const { tickers, numPoints, parameters, riskFreeRate } = req.body as {
        tickers: string[];
        numPoints?: number;
        parameters: BacktestParameters;
        riskFreeRate?: number;
      };

      const result = await runEfficientFrontier(tickers, parameters, numPoints, riskFreeRate);

      recordBacktestRequest('efficient-frontier', 'sync', 'success');
      res.json({ success: true, data: result });
    },
    {
      logMsg: 'Efficient frontier error',
      code: 'EFFICIENT_FRONTIER_ERROR',
      title: 'Efficient frontier failed',
      detail: 'Failed to calculate efficient frontier',
      endpoint: 'efficient-frontier',
    },
  ),
);

export default router;
