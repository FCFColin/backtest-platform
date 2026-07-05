/**
 * 回测路由
 * POST /api/backtest/portfolio - 运行组合回测
 * POST /api/backtest/analysis - 运行资产分析
 * POST /api/backtest/monte-carlo - 运行蒙特卡洛模拟
 * POST /api/backtest/optimize - 运行组合优化
 * POST /api/backtest/efficient-frontier - 计算有效前沿
 */

import { Router, type Request, type Response } from 'express';
import type { Portfolio, BacktestParameters } from '@backtest/shared/types.js';
import { MAX_TICKERS } from '@backtest/shared/constants.js';
import { backtestApplicationService } from '../application/backtest-service.js';
import {
  preparePortfolioBacktest,
  collectInvalidTickerWarnings,
} from '../application/backtest-query-service.js';
import {
  compressBacktestResultForSync,
  extractBacktestSeries,
} from '../utils/compressBacktestResult.js';
import {
  backtestCacheKey,
  getBacktestResultCache,
  setBacktestResultCache,
} from '../utils/backtestResultCache.js';
import { withTimeout } from '../utils/timeout.js';
import { config } from '../config/index.js';
import { fetchHistoryData, searchTickers } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { buildEnginePortfolioBody, buildEngineParams } from '../utils/engineBodyBuilder.js';
import { callEngineStrict, EngineUnavailableError } from '../utils/engineClient.js';
import { sanitizeLog } from '../utils/logSanitizer.js';
import { validate } from '../middleware/validate.js';
import {
  portfolioBacktestSchema,
  portfolioSeriesSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
} from '../schemas/backtest.js';
import { loadCpiMapFromDb, loadExchangeRatesFromDb } from '../db/macroData.js';

const router = Router();

/**
 * 将引擎不可用错误翻译为 503 + Retry-After（ADR-027 fail-closed）。
 *
 * 企业理由：正确性关键计算的引擎不可用必须显式失败，而非静默返回 Node 不一致结果。
 * @returns 若已处理该错误返回 true，调用方应 return。
 */
function handleEngineUnavailable(res: Response, error: unknown): boolean {
  if (error instanceof EngineUnavailableError) {
    sendProblem(res, 503, 'ENGINE_UNAVAILABLE', 'Service Unavailable', {
      detail: error.message,
      headers: { 'Retry-After': String(error.retryAfterSeconds) },
    });
    return true;
  }
  return false;
}

/** 过滤 priceData，只保留指定 tickers 的数据 */
function filterPriceData(
  priceData: Record<string, Record<string, number>>,
  tickers: Set<string>,
): Record<string, Record<string, number>> {
  const filtered: Record<string, Record<string, number>> = {};
  for (const ticker of tickers) {
    if (priceData[ticker]) {
      filtered[ticker] = priceData[ticker];
    }
  }
  return filtered;
}

function checkTickerLimit(res: Response, count: number): boolean {
  if (count > MAX_TICKERS) {
    sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED', 'Ticker limit exceeded', {
      detail: `ticker 数量超过限制 (max ${MAX_TICKERS})`,
    });
    return false;
  }
  return true;
}

function fetchPriceData(
  tickers: string[],
  startDate: string,
  endDate: string,
): Promise<Record<string, Record<string, number>>> {
  return withTimeout(fetchHistoryData(tickers, startDate, endDate), 60_000, 'fetch-history-data');
}

/** 加载宏观经济数据（CPI + 汇率），根据 parameters 统一处理 */
async function loadMacroData(
  parameters: BacktestParameters,
): Promise<{ cpiData: Record<string, number>; exchangeRates: Record<string, number> }> {
  const baseCurrency = parameters.baseCurrency || 'usd';
  const cpiCountry = baseCurrency === 'cny' ? 'cn' : 'us';
  const cpiData = parameters.adjustForInflation ? await loadCpiMapFromDb(cpiCountry) : {};
  const exchangeRates = baseCurrency === 'cny' ? await loadExchangeRatesFromDb() : {};
  return { cpiData, exchangeRates };
}

const MC_PARAMS_ALLOWED_KEYS = new Set([
  'numSimulations',
  'blockSize',
  'withReplacement',
  'confidenceLevel',
  'distribution',
  'seed',
]);

/** 过滤 mcParams 中的未知键，仅保留白名单字段 */
function sanitizeMcParams(mcParams: object | undefined): Record<string, unknown> {
  if (!mcParams || typeof mcParams !== 'object' || Array.isArray(mcParams)) return {};
  const raw = mcParams as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (MC_PARAMS_ALLOWED_KEYS.has(key)) sanitized[key] = raw[key];
  }
  return sanitized;
}

/** 从组合列表中收集所有唯一 ticker 与资产总数 */
function collectTickersFromPortfolios(portfolioList: Portfolio[]): {
  tickers: string[];
  totalAssets: number;
} {
  const allTickers = new Set<string>();
  let totalAssets = 0;
  for (const p of portfolioList) {
    for (const asset of p.assets) allTickers.add(asset.ticker);
    totalAssets += p.assets.length;
  }
  return { tickers: Array.from(allTickers), totalAssets };
}

/**
 * 搜索 ticker
 * GET /api/backtest/search?query=aap&limit=10&offset=0
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.query as string;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string, 10) || 100), 1000);
    const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);

    if (!query || query.trim().length === 0) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing required parameter', {
        detail: 'Missing required query parameter: query',
      });
      return;
    }

    const results = await searchTickers(query.trim());
    const total = results.length;
    const paged = results.slice(offset, offset + limit);
    res.json({ success: true, data: paged, pagination: { total, limit, offset } });
  } catch (error) {
    logger.error({ err: error as Error }, 'Ticker search error');
    sendProblem(res, 500, 'SEARCH_ERROR', 'Search failed', { detail: 'Failed to search tickers' });
  }
});

/**
 * 运行组合回测
 * POST /api/backtest/portfolio
 * Body: { portfolios: Portfolio[], parameters: BacktestParameters }
 */
router.post(
  '/portfolio',
  validate(portfolioBacktestSchema),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const { portfolios, parameters } = req.body as {
        portfolios: Portfolio[];
        parameters: BacktestParameters;
      };

      let allTickers: Set<string>;
      let warnings: string[];
      try {
        const prep = preparePortfolioBacktest(portfolios, parameters);
        allTickers = prep.allTickers;
        warnings = prep.warnings;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendProblem(res, 422, 'VALIDATION_ERROR', 'Validation failed', { detail: msg });
        return;
      }

      const priceData = await fetchPriceData(
        Array.from(allTickers),
        parameters.startDate,
        parameters.endDate,
      );

      const invalidTickers: string[] = [];
      for (const ticker of allTickers) {
        if (!priceData[ticker] || Object.keys(priceData[ticker]).length === 0) {
          warnings.push(`${sanitizeLog(ticker)}: 未找到数据`);
          invalidTickers.push(ticker);
        }
      }
      collectInvalidTickerWarnings(allTickers, priceData, warnings);

      if (invalidTickers.length > 0) {
        sendProblem(res, 422, 'INVALID_TICKERS', 'Invalid tickers', {
          detail: `以下标的代码无效：${invalidTickers.join(', ')}`,
        });
        return;
      }

      const { cpiData, exchangeRates } = await loadMacroData(parameters);
      const { result } = await withTimeout(
        backtestApplicationService.runBacktest({
          portfolios,
          parameters,
          priceData,
          cpiData,
          exchangeRates,
        }),
        config.BACKTEST_SYNC_TIMEOUT_MS,
        'portfolio-backtest',
      );

      const cacheKey = backtestCacheKey(portfolios, parameters);
      setBacktestResultCache(cacheKey, result);

      const response: Record<string, unknown> = {
        success: true,
        data: compressBacktestResultForSync(result),
      };
      if (warnings.length > 0) {
        response.warnings = warnings;
      }
      res.json(response);
      logger.info(`[backtest] Portfolio backtest completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      if (handleEngineUnavailable(res, error)) return;
      const { TimeoutError } = await import('../utils/timeout.js');
      if (error instanceof TimeoutError) {
        sendProblem(res, 503, 'BACKTEST_TIMEOUT', 'Gateway Timeout', { detail: error.message });
        return;
      }
      logger.error({ err: error as Error }, 'Portfolio backtest error');
      logger.info(`[backtest] Portfolio backtest failed in ${Date.now() - startTime}ms`);
      sendProblem(res, 500, 'BACKTEST_ERROR', 'Backtest failed', {
        detail: 'Failed to run portfolio backtest',
      });
    }
  },
);

/**
 * 从 LRU 缓存补全 tab 序列（rolling / turnover / drawdown episodes），零二次引擎调用。
 * POST /api/backtest/portfolio/series
 * Body: { portfolios, parameters, series: ('rollingReturns'|'allocationHistory'|'drawdownEpisodes')[] }
 */
router.post(
  '/portfolio/series',
  validate(portfolioSeriesSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { portfolios, parameters, series } = req.body as {
        portfolios: Portfolio[];
        parameters: BacktestParameters;
        series: string[];
      };

      const cacheKey = backtestCacheKey(portfolios, parameters);
      const cached = getBacktestResultCache(cacheKey);
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
    } catch (error) {
      logger.error({ err: error as Error }, 'Portfolio series error');
      sendProblem(res, 500, 'SERIES_ERROR', 'Series fetch failed', {
        detail: 'Failed to fetch backtest series',
      });
    }
  },
);

/**
 * 运行资产分析
 * POST /api/backtest/analysis
 * Body: { tickers: string[], parameters: BacktestParameters }
 */
router.post(
  '/analysis',
  validate(analysisSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { parameters } = req.body as {
        tickers: string[] | string;
        parameters: BacktestParameters;
      };
      let { tickers } = req.body as {
        tickers: string[] | string;
        parameters: BacktestParameters;
      };

      // 支持tickers为空格/逗号分隔的字符串
      if (typeof tickers === 'string') {
        tickers = tickers
          .split(/[\s,]+/)
          .map((t: string) => t.trim())
          .filter(Boolean);
      }

      if (!checkTickerLimit(res, tickers.length)) return;

      const priceData = await fetchPriceData(tickers, parameters.startDate, parameters.endDate);

      const rustBody = {
        tickers,
        priceData,
        params: buildEngineParams(parameters),
      };
      let result = await callEngineStrict('/api/engine/analysis', rustBody);

      // 引擎返回 { assets: [...] }，前端期望 { tickers: [...] }，做字段映射
      const resultAny = result as unknown as Record<string, unknown>;
      if (resultAny && resultAny.assets && !resultAny.tickers) {
        result = {
          tickers: resultAny.assets,
          correlations: resultAny.correlations || [],
        } as unknown as typeof result;
      }

      res.json({ success: true, data: result });
    } catch (error) {
      if (handleEngineUnavailable(res, error)) return;
      logger.error({ err: error as Error }, 'Analysis error');
      sendProblem(res, 500, 'ANALYSIS_ERROR', 'Analysis failed', {
        detail: 'Failed to run analysis',
      });
    }
  },
);

/**
 * 运行蒙特卡洛模拟
 * POST /api/backtest/monte-carlo
 * Body: { portfolio: Portfolio, parameters: BacktestParameters, mcParams?: object }
 *   或  { portfolios: Portfolio[], parameters: BacktestParameters, mcParams?: object }
 */
router.post(
  '/monte-carlo',
  validate(monteCarloSchema),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const { portfolio, portfolios, parameters, mcParams } = req.body as {
        portfolio?: Portfolio;
        portfolios?: Portfolio[];
        parameters: BacktestParameters;
        mcParams?: object;
      };

      // 支持两种格式：portfolio（单个）或 portfolios（数组）
      const portfolioList = (portfolios || (portfolio ? [portfolio] : undefined))!;

      const { tickers: tickerArr, totalAssets } = collectTickersFromPortfolios(portfolioList);
      const allTickers = new Set(tickerArr);

      if (!checkTickerLimit(res, Math.max(portfolioList.length, totalAssets))) return;
      const priceData = await fetchPriceData(tickerArr, parameters.startDate, parameters.endDate);

      const sanitizedMcParams = sanitizeMcParams(mcParams);

      // 调用引擎：fail-closed（ADR-027）。每个组合都走引擎，避免主引擎与 Node 混用导致结果不一致。
      const { cpiData, exchangeRates } = await loadMacroData(parameters);
      const results = await Promise.all(
        portfolioList.map((p) =>
          callEngineStrict('/api/engine/monte-carlo', {
            portfolio: buildEnginePortfolioBody(p),
            priceData: filterPriceData(priceData, allTickers),
            params: buildEngineParams(parameters),
            cpiData,
            exchangeRates,
            mcParams: sanitizedMcParams,
          }),
        ),
      );

      // 单组合返回对象，多组合返回数组（保持原响应契约）。
      res.json({ success: true, data: portfolioList.length === 1 ? results[0] : results });
      logger.info(`[backtest] Monte Carlo completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      if (handleEngineUnavailable(res, error)) return;
      logger.error({ err: error as Error }, 'Monte Carlo simulation error');
      sendProblem(res, 500, 'MONTE_CARLO_ERROR', 'Monte Carlo failed', {
        detail: 'Failed to run Monte Carlo simulation',
      });
    }
  },
);

/**
 * 运行组合优化
 * POST /api/backtest/optimize
 * Body: { tickers: string[], objective: string, constraints?: object, parameters: BacktestParameters }
 */
router.post(
  '/optimize',
  validate(optimizeSchema),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const { tickers, objective, constraints, parameters, numIterations } = req.body as {
        tickers: string[];
        objective: 'maxSharpe' | 'minVolatility' | 'maxReturn';
        constraints?: { minWeight?: number; maxWeight?: number };
        parameters: BacktestParameters;
        numIterations?: number;
      };

      if (!checkTickerLimit(res, tickers.length)) return;

      const cappedIterations = numIterations ? Math.min(numIterations, 100000) : 10000;

      const priceData = await fetchPriceData(tickers, parameters.startDate, parameters.endDate);

      const rustBody = {
        tickers,
        priceData: filterPriceData(priceData, new Set(tickers)),
        objective,
        constraints: constraints || {},
        numIterations: cappedIterations,
      };
      const result = await callEngineStrict('/api/engine/optimize', rustBody);

      logger.info(`[backtest] Optimization completed in ${Date.now() - startTime}ms`);
      res.json({ success: true, data: result });
    } catch (error) {
      if (handleEngineUnavailable(res, error)) return;
      logger.error({ err: error as Error }, 'Optimization error');
      sendProblem(res, 500, 'OPTIMIZATION_ERROR', 'Optimization failed', {
        detail: 'Failed to optimize portfolio',
      });
    }
  },
);

/**
 * 计算有效前沿
 * POST /api/backtest/efficient-frontier
 * Body: { tickers: string[], numPoints?: number, parameters: BacktestParameters }
 */
router.post(
  '/efficient-frontier',
  validate(efficientFrontierSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { tickers, numPoints, parameters, riskFreeRate } = req.body as {
        tickers: string[];
        numPoints?: number;
        parameters: BacktestParameters;
        riskFreeRate?: number;
      };

      if (!checkTickerLimit(res, tickers.length)) return;

      const priceData = await fetchPriceData(tickers, parameters.startDate, parameters.endDate);

      // 调用引擎：fail-closed（ADR-027）
      const rustBody = {
        tickers,
        priceData: filterPriceData(priceData, new Set(tickers)),
        numPoints: numPoints || 20,
        riskFreeRate: riskFreeRate || 0.02,
      };
      const result = await callEngineStrict('/api/engine/efficient-frontier', rustBody);

      res.json({ success: true, data: result });
    } catch (error) {
      if (handleEngineUnavailable(res, error)) return;
      logger.error({ err: error as Error }, 'Efficient frontier error');
      sendProblem(res, 500, 'EFFICIENT_FRONTIER_ERROR', 'Efficient frontier failed', {
        detail: 'Failed to calculate efficient frontier',
      });
    }
  },
);

export default router;
