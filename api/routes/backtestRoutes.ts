/**
 * 回测路由
 * POST /api/backtest/portfolio - 运行组合回测
 * POST /api/backtest/analysis - 运行资产分析
 * POST /api/backtest/monte-carlo - 运行蒙特卡洛模拟
 * POST /api/backtest/optimize - 运行组合优化
 * POST /api/backtest/efficient-frontier - 计算有效前沿
 */

import { Router, type Request, type Response } from 'express';
import type {
  Portfolio,
  BacktestParameters,
} from '../../shared/types.js';
import { MAX_TICKERS } from '../../shared/constants.js';
import { runAnalysis, calculateDrag } from '../engine/portfolio.js';
import { backtestApplicationService } from '../application/backtest-service.js';
import { runMonteCarlo } from '../engine/monteCarlo.js';
import { optimizePortfolio, calcEfficientFrontier } from '../engine/optimizer.js';
import { fetchHistoryData, searchTickers } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { buildRustPortfolioBody, buildRustParams } from '../utils/rustBodyBuilder.js';
import { callRustWithFallback, unwrapFallbackResult } from '../utils/rustFallback.js';
import { DEGRADED_WARNING } from '../config/index.js';
import { sanitizeLog } from '../utils/logSanitizer.js';
import { isValidDate } from '../utils/dateUtils.js';
import { validate } from '../middleware/validate.js';
import {
  portfolioBacktestSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
} from '../schemas/backtest.js';
import fs from 'fs';
import path from 'path';

const router = Router();

/** 过滤 priceData，只保留指定 tickers 的数据（减少发送到 Rust 引擎的数据量） */
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

/** 加载宏观经济数据（CPI + 汇率），根据 parameters 统一处理 */
function loadMacroData(parameters: BacktestParameters): { cpiData: Record<string, number>; exchangeRates: Record<string, number> } {
  const baseCurrency = parameters.baseCurrency || 'usd';
  const cpiCountry = baseCurrency === 'cny' ? 'cn' : 'us';
  const cpiData = parameters.adjustForInflation ? loadCPIData(cpiCountry) : {};
  const exchangeRates = baseCurrency === 'cny' ? loadExchangeRates() : {};
  return { cpiData, exchangeRates };
}

// CPI数据缓存（按国家）
const cpiDataCache: Record<string, Record<string, number>> = {};

function loadCPIData(country: string = 'us'): Record<string, number> {
  if (cpiDataCache[country]) return cpiDataCache[country];
  const fileName = country === 'cn' ? 'cn_cpi.json' : 'us_cpi.json';
  const cpiFilePath = path.resolve(process.cwd(), 'data', 'market', 'cpi', fileName);
  if (fs.existsSync(cpiFilePath)) {
    const raw = JSON.parse(fs.readFileSync(cpiFilePath, 'utf-8'));
    // 将 [{date, value}] 转为 {date: value}
    const map: Record<string, number> = {};
    for (const item of raw) {
      map[item.date] = item.value;
    }
    cpiDataCache[country] = map;
    return map;
  }
  return {};
}

// 汇率数据缓存
let exchangeRateCache: Record<string, number> | null = null;

function loadExchangeRates(): Record<string, number> {
  if (exchangeRateCache) return exchangeRateCache;
  const filePath = path.resolve(process.cwd(), 'data', 'market', 'exchange_rates', 'usd_cny.json');
  if (fs.existsSync(filePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      // usd_cny.json 已经是 {date: rate} 格式
      exchangeRateCache = raw;
      return raw;
    } catch (err) {
      logger.warn(`[loadExchangeRates] 读取汇率数据失败: ${(err as Error).message}`);
      return {};
    }
  }
  return {};
}

/**
 * 搜索 ticker
 * GET /api/backtest/search?query=aap&limit=10
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.query as string;
    const limit = parseInt(req.query.limit as string, 10) || 10;

    if (!query || query.trim().length === 0) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing required parameter', 'Missing required query parameter: query');
      return;
    }

    const results = await searchTickers(query.trim());
    res.json({ success: true, data: results.slice(0, limit) });
  } catch (error) {
    logger.error({ err: error as Error }, 'Ticker search error');
    sendProblem(res, 500, 'SEARCH_ERROR', 'Search failed', 'Failed to search tickers');
  }
});

/**
 * 运行组合回测
 * POST /api/backtest/portfolio
 * Body: { portfolios: Portfolio[], parameters: BacktestParameters }
 */
router.post('/portfolio', validate(portfolioBacktestSchema), async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const { portfolios, parameters } = req.body as {
      portfolios: Portfolio[];
      parameters: BacktestParameters;
    };

    if (!portfolios || !parameters) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing required fields', 'Missing required fields: portfolios, parameters');
      return;
    }

    // 校验日期格式
    if (!isValidDate(parameters.startDate) || !isValidDate(parameters.endDate)) {
      sendProblem(res, 422, 'INVALID_DATE', 'Invalid date format', 'Invalid date format, expected YYYY-MM-DD');
      return;
    }

    // 收集所有需要的 ticker
    const allTickers = new Set<string>();
    let totalAssets = 0;
    for (const portfolio of portfolios) {
      for (const asset of portfolio.assets) {
        allTickers.add(asset.ticker);
      }
      totalAssets += portfolio.assets.length;
    }

    // 校验 ticker 数量限制
    if (portfolios.length > MAX_TICKERS || totalAssets > MAX_TICKERS) {
      sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED', 'Ticker limit exceeded', `组合数量或资产总数超过限制 (max ${MAX_TICKERS})`);
      return;
    }
    if (parameters.benchmarkTicker) {
      allTickers.add(parameters.benchmarkTicker);
    }

    // 获取价格数据
    const priceData = await fetchHistoryData(
      Array.from(allTickers),
      parameters.startDate,
      parameters.endDate,
    );

    // 检查无效 ticker（priceData 中不存在或数据为空）
    const warnings: string[] = [];
    const invalidTickers: string[] = [];
    for (const ticker of allTickers) {
      if (!priceData[ticker] || Object.keys(priceData[ticker]).length === 0) {
        warnings.push(`${sanitizeLog(ticker)}: 未找到数据`);
        invalidTickers.push(ticker);
      }
    }

    // 如果有无效 ticker，直接返回错误（不运行回测）
    if (invalidTickers.length > 0) {
      res.json({
        success: false,
        error: `以下标的代码无效：${invalidTickers.join(', ')}`,
        warnings,
      });
      return;
    }

    // 运行回测：通过 Application Service 调用引擎（Go/Rust 优先，Node.js 降级）+ 发布领域事件
    const { cpiData, exchangeRates } = loadMacroData(parameters);
    const { result, degraded: isDegraded } = await backtestApplicationService.runBacktest({
      portfolios,
      parameters,
      priceData,
      cpiData,
      exchangeRates,
    });

    const response: Record<string, unknown> = { success: true, data: result };
    if (isDegraded) {
      // 降级模式：对配置了 drag 的组合使用 JS polyfill 计算近似 drag
      // drag 配置位于每个 Portfolio 上（年化百分比，如 0.5 表示 0.5%）
      let dragApplied = false;
      for (let i = 0; i < portfolios.length; i++) {
        const portfolio = portfolios[i];
        if (portfolio.drag && portfolio.drag > 0 && result.portfolios[i]) {
          const portfolioValues = result.portfolios[i].growthCurve.map((g: { value: number }) => g.value);
          const cashflows = (parameters.oneTimeCashflows || []).map((cf) => ({
            date: cf.date,
            amount: cf.amount,
          }));
          result.portfolios[i].drag = calculateDrag(
            portfolioValues,
            cashflows,
            portfolio.rebalanceFrequency || 'none',
            portfolio.drag / 100, // 百分比转小数（0.5% -> 0.005）
          );
          dragApplied = true;
        }
      }
      response.degraded = true;
      response.degradedCode = 'RUST_ENGINE_UNAVAILABLE';
      response.degradedMessage = 'Rust 引擎不可用，已降级到 Node.js 备用引擎';
      response.degradedWarning = dragApplied
        ? DEGRADED_WARNING.WITH_DRAG
        : DEGRADED_WARNING.WITHOUT_DRAG;
    }
    if (warnings.length > 0) {
      response.warnings = warnings;
    }
    res.json(response);
    logger.info(`[backtest] Portfolio backtest completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    logger.error({ err: error as Error }, 'Portfolio backtest error');
    logger.info(`[backtest] Portfolio backtest failed in ${Date.now() - startTime}ms`);
    sendProblem(res, 500, 'BACKTEST_ERROR', 'Backtest failed', 'Failed to run portfolio backtest');
  }
});

/**
 * 运行资产分析
 * POST /api/backtest/analysis
 * Body: { tickers: string[], parameters: BacktestParameters }
 */
router.post('/analysis', validate(analysisSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { parameters } = req.body as {
      tickers: string[] | string;
      parameters: BacktestParameters;
    };
    let { tickers } = req.body as {
      tickers: string[] | string;
      parameters: BacktestParameters;
    };

    if (!tickers || !parameters) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing required fields', 'Missing required fields: tickers, parameters');
      return;
    }

    // 支持tickers为空格/逗号分隔的字符串
    if (typeof tickers === 'string') {
      tickers = tickers.split(/[\s,]+/).map((t: string) => t.trim()).filter(Boolean);
    }

    // 校验 ticker 数量限制
    if (tickers.length > MAX_TICKERS) {
      sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED', 'Ticker limit exceeded', `ticker 数量超过限制 (max ${MAX_TICKERS})`);
      return;
    }

    // 校验日期格式
    if (!isValidDate(parameters.startDate) || !isValidDate(parameters.endDate)) {
      sendProblem(res, 422, 'INVALID_DATE', 'Invalid date format', 'Invalid date format, expected YYYY-MM-DD');
      return;
    }

    const priceData = await fetchHistoryData(
      tickers,
      parameters.startDate,
      parameters.endDate,
    );

    // 尝试 Rust 引擎，失败时降级到 Node.js
    const rustBody = {
      tickers,
      priceData,
      params: buildRustParams(parameters),
    };
    let result = await callRustWithFallback(
      '/api/engine/analysis',
      rustBody,
      () => runAnalysis(tickers, priceData, parameters),
    );

    // 解包降级响应
    const { data: analysisData, degraded: isAnalysisDegraded } = unwrapFallbackResult(result);
    result = analysisData as typeof result;

    // Rust 引擎返回 { assets: [...] }，前端期望 { tickers: [...] }，做字段映射
    const resultAny = result as unknown as Record<string, unknown>;
    if (resultAny && resultAny.assets && !resultAny.tickers) {
      result = { tickers: resultAny.assets, correlations: resultAny.correlations || [] } as unknown as typeof result;
    }

    const response: Record<string, unknown> = { success: true, data: result };
    if (isAnalysisDegraded) {
      response.degraded = true;
      response.degradedCode = 'RUST_ENGINE_UNAVAILABLE';
      response.degradedMessage = 'Rust 引擎不可用，已降级到 Node.js 备用引擎';
    }
    res.json(response);
  } catch (error) {
    logger.error({ err: error as Error }, 'Analysis error');
    sendProblem(res, 500, 'ANALYSIS_ERROR', 'Analysis failed', 'Failed to run analysis');
  }
});

/**
 * 运行蒙特卡洛模拟
 * POST /api/backtest/monte-carlo
 * Body: { portfolio: Portfolio, parameters: BacktestParameters, mcParams?: object }
 *   或  { portfolios: Portfolio[], parameters: BacktestParameters, mcParams?: object }
 */
router.post('/monte-carlo', validate(monteCarloSchema), async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const { portfolio, portfolios, parameters, mcParams } = req.body as {
      portfolio?: Portfolio;
      portfolios?: Portfolio[];
      parameters: BacktestParameters;
      mcParams?: object;
    };

    // 支持两种格式：portfolio（单个）或 portfolios（数组）
    const portfolioList = portfolios || (portfolio ? [portfolio] : undefined);

    if (!portfolioList || portfolioList.length === 0 || !parameters) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing required fields', 'Missing required fields: portfolio (or portfolios), parameters');
      return;
    }

    // 校验日期格式
    if (!isValidDate(parameters.startDate) || !isValidDate(parameters.endDate)) {
      sendProblem(res, 422, 'INVALID_DATE', 'Invalid date format', 'Invalid date format, expected YYYY-MM-DD');
      return;
    }

    // 收集所有 ticker
    const allTickers = new Set<string>();
    let totalAssets = 0;
    for (const p of portfolioList) {
      for (const asset of p.assets) {
        allTickers.add(asset.ticker);
      }
      totalAssets += p.assets.length;
    }

    // 校验 ticker 数量限制
    if (portfolioList.length > MAX_TICKERS || totalAssets > MAX_TICKERS) {
      sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED', 'Ticker limit exceeded', `组合数量或资产总数超过限制 (max ${MAX_TICKERS})`);
      return;
    }
    const tickerArr = Array.from(allTickers);
    const priceData = await fetchHistoryData(
      tickerArr,
      parameters.startDate,
      parameters.endDate,
    );

    // 验证 mcParams 结构并过滤未知键
    const MC_PARAMS_ALLOWED_KEYS = new Set(['numSimulations', 'blockSize', 'withReplacement', 'confidenceLevel', 'distribution', 'seed']);
    const rawMcParams = (mcParams && typeof mcParams === 'object' && !Array.isArray(mcParams))
      ? mcParams as Record<string, unknown>
      : {};
    const sanitizedMcParams: Record<string, unknown> = {};
    for (const key of Object.keys(rawMcParams)) {
      if (MC_PARAMS_ALLOWED_KEYS.has(key)) {
        sanitizedMcParams[key] = rawMcParams[key];
      }
    }

    // 优先Rust引擎（对第一个组合）
    const firstPortfolio = portfolioList[0];
    const { cpiData, exchangeRates } = loadMacroData(parameters);
    const rustBody = {
      portfolio: buildRustPortfolioBody(firstPortfolio),
      priceData: filterPriceData(priceData, allTickers),
      params: buildRustParams(parameters),
      cpiData,
      exchangeRates,
      mcParams: sanitizedMcParams,
    };
    const firstRawResult = await callRustWithFallback(
      '/api/engine/monte-carlo',
      rustBody,
      () => runMonteCarlo(firstPortfolio, priceData, parameters, sanitizedMcParams),
    );
    const { data: firstResult, degraded: isMcDegraded } = unwrapFallbackResult(firstRawResult);

    // 如果只有一个组合，直接返回结果
    if (portfolioList.length === 1) {
      const response: Record<string, unknown> = { success: true, data: firstResult };
      if (isMcDegraded) {
        response.degraded = true;
        response.degradedCode = 'RUST_ENGINE_UNAVAILABLE';
        response.degradedMessage = 'Rust 引擎不可用，已降级到 Node.js 备用引擎';
      }
      res.json(response);
    } else {
      // 多个组合：第一个用Rust结果（如果可用），其余用Node降级
      const finalResults = portfolioList.map((p, idx) => {
        if (idx === 0) return firstResult;
        return runMonteCarlo(p, priceData, parameters, mcParams);
      });
      const response: Record<string, unknown> = { success: true, data: finalResults };
      if (isMcDegraded) {
        response.degraded = true;
        response.degradedCode = 'RUST_ENGINE_UNAVAILABLE';
        response.degradedMessage = 'Rust 引擎不可用，已降级到 Node.js 备用引擎';
      }
      res.json(response);
    }
    logger.info(`[backtest] Monte Carlo completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    logger.error({ err: error as Error }, 'Monte Carlo simulation error');
    sendProblem(res, 500, 'MONTE_CARLO_ERROR', 'Monte Carlo failed', 'Failed to run Monte Carlo simulation');
  }
});

/**
 * 运行组合优化
 * POST /api/backtest/optimize
 * Body: { tickers: string[], objective: string, constraints?: object, parameters: BacktestParameters }
 */
router.post('/optimize', validate(optimizeSchema), async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const { tickers, objective, constraints, parameters, riskFreeRate, numIterations } = req.body as {
      tickers: string[];
      objective: 'maxSharpe' | 'minVolatility' | 'maxReturn';
      constraints?: { minWeight?: number; maxWeight?: number };
      parameters: BacktestParameters;
      riskFreeRate?: number;
      numIterations?: number;
    };

    if (!tickers || !parameters) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing required fields', 'Missing required fields: tickers, parameters');
      return;
    }

    // 校验 ticker 数量限制
    if (tickers.length > MAX_TICKERS) {
      sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED', 'Ticker limit exceeded', `ticker 数量超过限制 (max ${MAX_TICKERS})`);
      return;
    }

    // 校验日期格式
    if (!isValidDate(parameters.startDate) || !isValidDate(parameters.endDate)) {
      sendProblem(res, 422, 'INVALID_DATE', 'Invalid date format', 'Invalid date format, expected YYYY-MM-DD');
      return;
    }

    // 限制 numIterations 上限
    const cappedIterations = numIterations ? Math.min(numIterations, 100000) : 10000;

    const priceData = await fetchHistoryData(
      tickers,
      parameters.startDate,
      parameters.endDate,
    );

    // 优先 Rust 引擎，降级到 Node.js
    const rustBody = {
      tickers,
      priceData: filterPriceData(priceData, new Set(tickers)),
      objective,
      constraints: constraints || {},
      numIterations: cappedIterations,
    };
    const rawResult = await callRustWithFallback(
      '/api/engine/optimize',
      rustBody,
      () => optimizePortfolio(tickers, priceData, objective, constraints, riskFreeRate, cappedIterations),
    );
    const { data: result, degraded: isOptDegraded } = unwrapFallbackResult(rawResult);

    logger.info(`[backtest] Optimization completed in ${Date.now() - startTime}ms`);
    const response: Record<string, unknown> = { success: true, data: result };
    if (isOptDegraded) {
      response.degraded = true;
      response.degradedCode = 'RUST_ENGINE_UNAVAILABLE';
      response.degradedMessage = 'Rust 引擎不可用，已降级到 Node.js 备用引擎';
    }
    res.json(response);
  } catch (error) {
    logger.error({ err: error as Error }, 'Optimization error');
    sendProblem(res, 500, 'OPTIMIZATION_ERROR', 'Optimization failed', 'Failed to optimize portfolio');
  }
});

/**
 * 计算有效前沿
 * POST /api/backtest/efficient-frontier
 * Body: { tickers: string[], numPoints?: number, parameters: BacktestParameters }
 */
router.post('/efficient-frontier', validate(efficientFrontierSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { tickers, numPoints, parameters, riskFreeRate, numIterations } = req.body as {
      tickers: string[];
      numPoints?: number;
      parameters: BacktestParameters;
      riskFreeRate?: number;
      numIterations?: number;
    };

    if (!tickers || !parameters) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing required fields', 'Missing required fields: tickers, parameters');
      return;
    }

    // 校验 ticker 数量限制
    if (tickers.length > MAX_TICKERS) {
      sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED', 'Ticker limit exceeded', `ticker 数量超过限制 (max ${MAX_TICKERS})`);
      return;
    }

    // 校验日期格式
    if (!isValidDate(parameters.startDate) || !isValidDate(parameters.endDate)) {
      sendProblem(res, 422, 'INVALID_DATE', 'Invalid date format', 'Invalid date format, expected YYYY-MM-DD');
      return;
    }

    const priceData = await fetchHistoryData(
      tickers,
      parameters.startDate,
      parameters.endDate,
    );

    // 优先 Rust 引擎，降级到 Node.js
    const rustBody = {
      tickers,
      priceData: filterPriceData(priceData, new Set(tickers)),
      numPoints: numPoints || 20,
      riskFreeRate: riskFreeRate || 0.02,
    };
    const rawResult = await callRustWithFallback(
      '/api/engine/efficient-frontier',
      rustBody,
      () => calcEfficientFrontier(tickers, priceData, numPoints, riskFreeRate, numIterations),
    );
    const { data: result, degraded: isEfDegraded } = unwrapFallbackResult(rawResult);

    const response: Record<string, unknown> = { success: true, data: result };
    if (isEfDegraded) {
      response.degraded = true;
      response.degradedCode = 'RUST_ENGINE_UNAVAILABLE';
      response.degradedMessage = 'Rust 引擎不可用，已降级到 Node.js 备用引擎';
    }
    res.json(response);
  } catch (error) {
    logger.error({ err: error as Error }, 'Efficient frontier error');
    sendProblem(res, 500, 'EFFICIENT_FRONTIER_ERROR', 'Efficient frontier failed', 'Failed to calculate efficient frontier');
  }
});

export default router;
