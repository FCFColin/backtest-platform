/**
 * 回测路由测试共享 fixtures
 *
 * 企业理由：backtest-route 原单文件 1260 行，按端点职责拆分为 portfolio/analysis/optimize
 * 三个测试文件。本模块集中维护复杂 mock 实现逻辑、app factory 与常用请求 payload，
 * 消除三份重复的 vi.fn 工厂代码（每份约 150 行）。
 *
 * 权衡：vi.mock 工厂因 vitest 文件级提升作用域只能引用同文件 vi.hoisted 值（不能引用 import），
 * 故各测试文件用 vi.hoisted 创建空 vi.fn 句柄，vi.mock 工厂引用这些句柄；本模块导出的
 * configureXxxMocks 在 import 完成后为这些 vi.fn 设置实现逻辑。vi.clearAllMocks
 * 仅清理调用记录不清实现，故 beforeEach 中实现持续生效。
 *
 * 时序：vi.hoisted（创建空 vi.fn）→ vi.mock 工厂（引用句柄）→ import helper →
 * configureXxxMocks（设置实现）→ 测试执行。
 */

import type { Router } from 'express';
import { startExpressApp, type TestServer } from './expressApp.js';
import { mockBacktestResult } from './storeFixtures.js';
import { TimeoutError } from '../../packages/backend/src/utils/timeout.js';
import { ValidationError } from '../../packages/backend/src/utils/errors.js';
import {
  clearBacktestResultCache,
  setBacktestResultCache,
  backtestCacheKey,
} from '../../packages/backend/src/application/backtest/backtestResultCache.js';
import { compressBacktestResultForSync } from '../../packages/backend/src/application/backtest/compressBacktestResult.js';

/**
 * 测试文件 vi.hoisted 创建的 mock 句柄集合类型。
 * 各字段为空 vi.fn（无实现），由 configurePortfolioBacktestMocks / configureAnalysisMocks /
 * configureMonteCarloMocks / configureOptimizationMocks / configureTickerHelpersMocks 按需设置实现。
 */
export interface BacktestMockHandles {
  runBacktest: ReturnType<(typeof import('vitest'))['fn']>;
  runPortfolioBacktest: ReturnType<(typeof import('vitest'))['fn']>;
  runAnalysis: ReturnType<(typeof import('vitest'))['fn']>;
  runMonteCarlo: ReturnType<(typeof import('vitest'))['fn']>;
  runOptimization: ReturnType<(typeof import('vitest'))['fn']>;
  runEfficientFrontier: ReturnType<(typeof import('vitest'))['fn']>;
  fetchHistoryData: ReturnType<(typeof import('vitest'))['fn']>;
  searchTickers: ReturnType<(typeof import('vitest'))['fn']>;
  callEngineStrict: ReturnType<(typeof import('vitest'))['fn']>;
  buildEngineParams: ReturnType<(typeof import('vitest'))['fn']>;
  preparePortfolioBacktest: ReturnType<(typeof import('vitest'))['fn']>;
  collectInvalidTickerWarnings: ReturnType<(typeof import('vitest'))['fn']>;
  collectTickersFromPortfolios: ReturnType<(typeof import('vitest'))['fn']>;
  filterPriceData: ReturnType<(typeof import('vitest'))['fn']>;
  fetchPriceData: ReturnType<(typeof import('vitest'))['fn']>;
  loadMacroData: ReturnType<(typeof import('vitest'))['fn']>;
  validateTickers: ReturnType<(typeof import('vitest'))['fn']>;
  portfolioToDomain: ReturnType<(typeof import('vitest'))['fn']>;
  sanitizeMcParams: ReturnType<(typeof import('vitest'))['fn']>;
}

/**
 * 为 portfolio 回测相关 mock 句柄设置实现逻辑。
 *
 * 包含 preparePortfolioBacktest（收集所有 ticker 含 benchmark）、
 * runPortfolioBacktest（编排数据获取→校验→引擎调用→缓存→压缩）、
 * collectInvalidTickerWarnings（默认无警告）。
 *
 * @param m - 测试文件 vi.hoisted 创建的 mock 句柄集合
 */
export function configurePortfolioBacktestMocks(m: BacktestMockHandles): void {
  // preparePortfolioBacktest 默认实现：收集所有 ticker（含 benchmark）
  m.preparePortfolioBacktest.mockImplementation(
    (portfolios: { assets: { ticker: string }[] }[], parameters: { benchmarkTicker?: string }) => {
      const allTickers = new Set<string>();
      for (const p of portfolios) {
        for (const a of p.assets) allTickers.add(a.ticker);
      }
      if (parameters?.benchmarkTicker) {
        allTickers.add(parameters.benchmarkTicker);
      }
      return { allTickers, warnings: [] as string[] };
    },
  );

  // runPortfolioBacktest：编排数据获取→校验→引擎调用→缓存→压缩
  m.runPortfolioBacktest.mockImplementation(
    async (opts: {
      portfolios: { assets: { ticker: string }[] }[];
      parameters: { startDate: string; endDate: string; benchmarkTicker?: string };
      tenantId?: string;
      ownerUserId?: string;
    }) => {
      const { portfolios, parameters, tenantId, ownerUserId } = opts;
      const prep = m.preparePortfolioBacktest(portfolios, parameters);
      const { allTickers, warnings } = prep;

      const priceData = (await m.fetchHistoryData(
        Array.from(allTickers),
        parameters.startDate,
        parameters.endDate,
      )) as Record<string, Record<string, number>>;

      // 检测无效标的（价格数据缺失）→ 抛 ValidationError(422, INVALID_TICKERS)
      const invalidTickers: string[] = [];
      for (const ticker of allTickers) {
        if (!priceData[ticker] || Object.keys(priceData[ticker]).length === 0) {
          invalidTickers.push(ticker);
        }
      }
      if (invalidTickers.length > 0) {
        throw new ValidationError(
          `以下标的代码无效：${invalidTickers.join(', ')}`,
          'INVALID_TICKERS',
        );
      }

      // 调用 runBacktest（引擎调用层 mock）— 超时/不可用错误由此抛出
      const { result } = await m.runBacktest({
        portfolios,
        parameters,
        priceData,
        tenantId,
        ownerUserId,
      });

      // 写入缓存（存未压缩的完整结果，供 /portfolio/series 补全序列）
      const cacheKey = backtestCacheKey(portfolios, parameters, tenantId);
      void setBacktestResultCache(cacheKey, result);

      // 返回压缩后的首屏结果 + 警告列表
      return { result: compressBacktestResultForSync(result), warnings };
    },
  );

  m.collectInvalidTickerWarnings.mockImplementation(
    (_tickers: unknown, _data: unknown, _warnings: string[]) => [],
  );
}

/**
 * 为 analysis 端点相关 mock 句柄设置实现逻辑。
 *
 * 包含 runAnalysis（fetchHistoryData → callEngineStrict → 返回 assets/correlations）。
 *
 * @param m - 测试文件 vi.hoisted 创建的 mock 句柄集合
 */
export function configureAnalysisMocks(m: BacktestMockHandles): void {
  m.runAnalysis.mockImplementation(async (tickers: string[], parameters: unknown) => {
    const params = parameters as { startDate: string; endDate: string };
    await m.fetchHistoryData(tickers, params.startDate, params.endDate);
    const result = await m.callEngineStrict('/api/engine/analysis', { tickers });
    const engineResp = result as { data?: { assets?: unknown[]; correlations?: unknown[][] } };
    const engineData = engineResp?.data;
    if (engineData && engineData.assets) {
      return { tickers: engineData.assets, correlations: engineData.correlations || [] };
    }
    return result;
  });
}

/**
 * 为 monte-carlo 端点相关 mock 句柄设置实现逻辑。
 *
 * 包含 runMonteCarlo（callEngineStrict 编排）与 sanitizeMcParams（白名单字段清洗）。
 *
 * @param m - 测试文件 vi.hoisted 创建的 mock 句柄集合
 */
export function configureMonteCarloMocks(m: BacktestMockHandles): void {
  m.runMonteCarlo.mockImplementation(
    async (portfolioList: unknown[], _parameters: unknown, mcParams?: object) => {
      const results = await Promise.all(
        (portfolioList as unknown[]).map(() =>
          m.callEngineStrict('/api/engine/monte-carlo', { mcParams }),
        ),
      );
      const data = portfolioList.length === 1 ? results[0] : results;
      return { data, warnings: [], dateRange: undefined };
    },
  );

  m.sanitizeMcParams.mockImplementation((mcParams: object | undefined) => {
    if (!mcParams || typeof mcParams !== 'object' || Array.isArray(mcParams)) return {};
    const raw = mcParams as Record<string, unknown>;
    const allowed = new Set([
      'numSimulations',
      'blockSize',
      'withReplacement',
      'confidenceLevel',
      'distribution',
      'seed',
    ]);
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(raw)) {
      if (allowed.has(key)) sanitized[key] = raw[key];
    }
    return sanitized;
  });
}

/**
 * 为 optimize / efficient-frontier 端点相关 mock 句柄设置实现逻辑。
 *
 * 包含 runOptimization（cap iterations 100000）与 runEfficientFrontier。
 *
 * @param m - 测试文件 vi.hoisted 创建的 mock 句柄集合
 */
export function configureOptimizationMocks(m: BacktestMockHandles): void {
  m.runOptimization.mockImplementation(
    async (
      tickers: string[],
      objective: string,
      constraints: object,
      parameters: { startDate: string; endDate: string },
      numIterations?: number,
    ) => {
      const cappedIterations = numIterations ? Math.min(numIterations, 100000) : 10000;
      await m.fetchHistoryData(tickers, parameters.startDate, parameters.endDate);
      const result = await m.callEngineStrict('/api/engine/optimize', {
        tickers,
        objective,
        constraints,
        numIterations: cappedIterations,
      });
      const engineResp = result as { data?: Record<string, unknown> };
      return engineResp?.data ?? result;
    },
  );

  m.runEfficientFrontier.mockImplementation(
    async (
      tickers: string[],
      parameters: { startDate: string; endDate: string },
      _numPoints?: number,
      _riskFreeRate?: number,
    ) => {
      await m.fetchHistoryData(tickers, parameters.startDate, parameters.endDate);
      const result = await m.callEngineStrict('/api/engine/efficient-frontier', {});
      const engineResp = result as { data?: Record<string, unknown> };
      return engineResp?.data ?? result;
    },
  );
}

/**
 * 为 backtest-helper 辅助 mock 句柄设置实现逻辑。
 *
 * 包含 collectTickersFromPortfolios（收集去重 ticker + 统计 totalAssets）、
 * filterPriceData（按 ticker 集合过滤）、fetchPriceData（fetchHistoryData 取 data）、
 * loadMacroData（默认空 cpi/exchangeRates）。
 *
 * 注意：searchTickers/validateTickers/portfolioToDomain 的实现由各测试用例按需设置。
 *
 * @param m - 测试文件 vi.hoisted 创建的 mock 句柄集合
 */
export function configureTickerHelpersMocks(m: BacktestMockHandles): void {
  m.collectTickersFromPortfolios.mockImplementation(
    (portfolioList: { assets: { ticker: string }[] }[]) => {
      const allTickers = new Set<string>();
      let totalAssets = 0;
      for (const p of portfolioList) {
        for (const asset of p.assets) allTickers.add(asset.ticker);
        totalAssets += p.assets.length;
      }
      return { tickers: Array.from(allTickers), totalAssets };
    },
  );
  m.filterPriceData.mockImplementation(
    (priceData: Record<string, Record<string, number>>, tickers: Set<string>) => {
      const filtered: Record<string, Record<string, number>> = {};
      for (const ticker of tickers) {
        if (priceData[ticker]) filtered[ticker] = priceData[ticker];
      }
      return filtered;
    },
  );
  m.fetchPriceData.mockImplementation(
    async (tickers: string[], startDate: string, endDate: string) => {
      const result = await m.fetchHistoryData(tickers, startDate, endDate);
      return (result as { data: Record<string, Record<string, number>> }).data || result;
    },
  );
  m.loadMacroData.mockImplementation(async () => ({ cpiData: {}, exchangeRates: {} }));
}

// ===== 导出真实模块（供测试使用） =====
export { TimeoutError, ValidationError, clearBacktestResultCache };

// ===== App factory 与 payload fixtures =====

/**
 * 在随机端口启动 Express 应用挂载 backtest 路由。
 *
 * @param routes - backtest 路由实例（由测试文件 import backtestRoutes 传入）
 * @returns 测试服务器句柄
 */
export async function createBacktestApp(routes: Router): Promise<TestServer> {
  return startExpressApp((app) => app.use('/api/backtest', routes), { bodyLimit: '10mb' });
}

/** 构造有效的回测请求体（portfolio 端点） */
export function createValidRequestBody() {
  return {
    portfolios: [
      {
        assets: [
          { ticker: 'AAPL', weight: 60 },
          { ticker: 'BND', weight: 40 },
        ],
        rebalanceFrequency: 'monthly' as const,
      },
    ],
    parameters: {
      startDate: '2024-01-01',
      endDate: '2024-06-30',
      startingValue: 10000,
    },
  };
}

/** 构造有效的参数对象（analysis/monte-carlo/optimize/efficient-frontier 共用） */
export function createValidParameters() {
  return {
    startDate: '2024-01-01',
    endDate: '2024-06-30',
    startingValue: 10000,
  };
}

/** 构造有效的单组合对象（monte-carlo 用） */
export function createValidPortfolio() {
  return {
    assets: [
      { ticker: 'AAPL', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'monthly' as const,
  };
}

/**
 * 配置 portfolio 端点默认 mock（fetchHistoryData/runBacktest/existsSync）并启动测试服务器。
 * 供 portfolio / portfolio/series / portfolio(continued) describe 的 beforeEach 调用。
 *
 * @param routes - backtest 路由实例
 * @param m - vi.hoisted 创建的 mock 句柄集合
 * @returns 测试服务器句柄
 */
export async function setupPortfolioServer(
  routes: Router,
  m: BacktestMockHandles,
): Promise<TestServer> {
  const { vi } = await import('vitest');
  vi.clearAllMocks();
  clearBacktestResultCache();
  m.fetchHistoryData.mockResolvedValue({
    AAPL: { '2024-01-02': 185.5, '2024-01-03': 186.0 },
    BND: { '2024-01-02': 72.3, '2024-01-03': 72.5 },
  });
  m.runBacktest.mockResolvedValue({
    result: mockBacktestResult({
      portfolios: [
        {
          name: 'Portfolio 0',
          growthCurve: [
            { date: '2024-01-02', value: 10000 },
            { date: '2024-01-03', value: 10100 },
          ],
          rollingReturns: [],
        },
      ],
    }),
    degraded: false,
  });
  // fsMocks 在 vi.hoisted 中以对象形式存在，需通过 m 间接访问
  return createBacktestApp(routes);
}

/** 配置引擎路由默认 mock（fetchHistoryData/buildEngineParams/callEngineStrict） */
function setupEngineRouteMocks(m: BacktestMockHandles) {
  m.fetchHistoryData.mockResolvedValue({
    AAPL: { '2024-01-02': 185.5, '2024-01-03': 186.0 },
    BND: { '2024-01-02': 72.3, '2024-01-03': 72.5 },
  });
  m.buildEngineParams.mockReturnValue({
    startDate: '2024-01-01',
    endDate: '2024-06-30',
  });
  m.callEngineStrict.mockResolvedValue({});
}

/**
 * 启动引擎路由测试服务器（analysis/monte-carlo/optimize/efficient-frontier）。
 * 清理 mock、配置默认引擎路由 mock、启动 app。
 *
 * @param routes - backtest 路由实例
 * @param m - vi.hoisted 创建的 mock 句柄集合
 * @returns 测试服务器句柄
 */
export async function startEngineRouteServer(
  routes: Router,
  m: BacktestMockHandles,
): Promise<TestServer> {
  const { vi } = await import('vitest');
  vi.clearAllMocks();
  setupEngineRouteMocks(m);
  return createBacktestApp(routes);
}
