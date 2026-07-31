/**
 * 回测路由测试共享 fixtures
 * 时序：vi.hoisted（空 vi.fn）→ vi.mock 工厂（引用句柄）→ import helper →
 * configureXxxMocks（设置实现）→ 测试执行。vi.clearAllMocks 仅清理调用记录不清实现。
 */

import type { Router } from 'express';
import { startExpressApp, type TestServer } from './expressApp.js';
import { mockBacktestResult } from './storeFixtures.js';
import { TimeoutError } from '../../packages/backend/src/utils/misc.js';
import { ValidationError } from '../../packages/backend/src/utils/errors.js';
import { clearBacktestResultCache, setBacktestResultCache, backtestCacheKey } from '../../packages/backend/src/application/backtest/backtestResultCache.js';
import { compressBacktestResultForSync } from '../../packages/backend/src/application/backtest/compressBacktestResult.js';

type MockFn = ReturnType<(typeof import('vitest'))['fn']>;

export class EngineUnavailableErrorStub extends Error {
  readonly retryAfterSeconds: number;
  readonly code = 'ENGINE_UNAVAILABLE';
  constructor(endpoint: string, retryAfterSeconds = 30) {
    super(`计算引擎暂不可用（${endpoint}），请稍后重试`);
    this.name = 'EngineUnavailableError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface BacktestMockHandles {
  runBacktest: MockFn; runPortfolioBacktest: MockFn; runAnalysis: MockFn;
  runMonteCarlo: MockFn; runOptimization: MockFn; runEfficientFrontier: MockFn;
  fetchHistoryData: MockFn; searchTickers: MockFn; callEngineStrict: MockFn;
  buildEngineParams: MockFn; preparePortfolioBacktest: MockFn;
  collectInvalidTickerWarnings: MockFn; collectDomainTickers: MockFn;
  filterPriceData: MockFn; fetchPriceDataWithRange: MockFn; loadMacroData: MockFn;
  validateTickers: MockFn; portfolioToDomain: MockFn; sanitizeMcParams: MockFn;
}

/** 为 portfolio 回测相关 mock 句柄设置实现逻辑。 */
export function configurePortfolioBacktestMocks(m: BacktestMockHandles): void {
  m.preparePortfolioBacktest.mockImplementation(
    (portfolios: { assets: { ticker: string }[] }[], parameters: { benchmarkTicker?: string }) => {
      const allTickers = new Set<string>();
      for (const p of portfolios) for (const a of p.assets) allTickers.add(a.ticker);
      if (parameters?.benchmarkTicker) allTickers.add(parameters.benchmarkTicker);
      return { allTickers, warnings: [] as string[] };
    },
  );

  m.runPortfolioBacktest.mockImplementation(
    async (opts: {
      portfolios: { assets: { ticker: string }[] }[];
      parameters: { startDate: string; endDate: string; benchmarkTicker?: string };
      tenantId?: string;
      ownerUserId?: string;
    }) => {
      const { portfolios, parameters, tenantId, ownerUserId } = opts;
      const { allTickers, warnings } = m.preparePortfolioBacktest(portfolios, parameters);
      const priceData = (await m.fetchHistoryData(Array.from(allTickers), parameters.startDate, parameters.endDate)) as Record<string, Record<string, number>>;
      const invalidTickers: string[] = [];
      for (const ticker of allTickers) {
        if (!priceData[ticker] || Object.keys(priceData[ticker]).length === 0) invalidTickers.push(ticker);
      }
      if (invalidTickers.length > 0) throw new ValidationError(`以下标的代码无效：${invalidTickers.join(', ')}`, 'INVALID_TICKERS');
      const { result } = await m.runBacktest({ portfolios, parameters, priceData, tenantId, ownerUserId });
      void setBacktestResultCache(backtestCacheKey(portfolios, parameters, tenantId), result);
      return { result: compressBacktestResultForSync(result), warnings };
    },
  );

  m.collectInvalidTickerWarnings.mockImplementation(() => []);
}

/** 为 analysis 端点相关 mock 句柄设置实现逻辑。 */
export function configureAnalysisMocks(m: BacktestMockHandles): void {
  m.runAnalysis.mockImplementation(async (tickers: string[], parameters: unknown) => {
    const params = parameters as { startDate: string; endDate: string };
    await m.fetchHistoryData(tickers, params.startDate, params.endDate);
    const result = await m.callEngineStrict('/api/engine/analysis', { tickers });
    const engineData = (result as { data?: { assets?: unknown[]; correlations?: unknown[][] } })?.data;
    if (engineData?.assets) return { tickers: engineData.assets, correlations: engineData.correlations || [] };
    return result;
  });
}

/** 为 monte-carlo 端点相关 mock 句柄设置实现逻辑。 */
export function configureMonteCarloMocks(m: BacktestMockHandles): void {
  m.runMonteCarlo.mockImplementation(async (portfolioList: unknown[], _parameters: unknown, mcParams?: object) => {
    const results = await Promise.all((portfolioList as unknown[]).map(() => m.callEngineStrict('/api/engine/monte-carlo', { mcParams })));
    return { data: portfolioList.length === 1 ? results[0] : results, warnings: [], dateRange: undefined };
  });

  const MC_ALLOWED = new Set(['numSimulations', 'blockSize', 'withReplacement', 'confidenceLevel', 'distribution', 'seed']);
  m.sanitizeMcParams.mockImplementation((mcParams: object | undefined) => {
    if (!mcParams || typeof mcParams !== 'object' || Array.isArray(mcParams)) return {};
    const raw = mcParams as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(raw)) if (MC_ALLOWED.has(key)) sanitized[key] = raw[key];
    return sanitized;
  });
}

/** 为 optimize / efficient-frontier 端点相关 mock 句柄设置实现逻辑。 */
export function configureOptimizationMocks(m: BacktestMockHandles): void {
  const extractData = (result: unknown) => (result as { data?: Record<string, unknown> })?.data ?? result;
  m.runOptimization.mockImplementation(
    async (tickers: string[], objective: string, constraints: object, parameters: { startDate: string; endDate: string }, numIterations?: number) => {
      const cappedIterations = numIterations ? Math.min(numIterations, 100000) : 10000;
      await m.fetchHistoryData(tickers, parameters.startDate, parameters.endDate);
      return extractData(await m.callEngineStrict('/api/engine/optimize', { tickers, objective, constraints, numIterations: cappedIterations }));
    },
  );
  m.runEfficientFrontier.mockImplementation(async (tickers: string[], parameters: { startDate: string; endDate: string }) => {
    await m.fetchHistoryData(tickers, parameters.startDate, parameters.endDate);
    return extractData(await m.callEngineStrict('/api/engine/efficient-frontier', {}));
  });
}

/** 为 backtest-helper 辅助 mock 句柄设置实现逻辑。 */
export function configureTickerHelpersMocks(m: BacktestMockHandles): void {
  m.collectDomainTickers.mockImplementation((domainPortfolios: { tickers: string[] }[], benchmarkTicker: string) => {
    const allTickers = new Set<string>();
    for (const p of domainPortfolios) for (const ticker of p.tickers) allTickers.add(ticker);
    if (benchmarkTicker) allTickers.add(benchmarkTicker);
    return allTickers;
  });
  m.filterPriceData.mockImplementation((priceData: Record<string, Record<string, number>>, tickers: Set<string>) => {
    const filtered: Record<string, Record<string, number>> = {};
    for (const ticker of tickers) if (priceData[ticker]) filtered[ticker] = priceData[ticker];
    return filtered;
  });
  m.fetchPriceDataWithRange.mockImplementation(async (tickers: string[], startDate: string, endDate: string) => {
    const r = (await m.fetchHistoryData(tickers, startDate, endDate)) as { data: Record<string, Record<string, number>>; degraded: boolean; degradedWarning?: string };
    return { priceData: r.data || {}, effectiveStartDate: startDate, effectiveEndDate: endDate, degraded: r.degraded ?? false, degradedWarning: r.degradedWarning };
  });
  m.loadMacroData.mockImplementation(async () => ({ cpiData: {}, exchangeRates: {} }));
}

export { TimeoutError, ValidationError, clearBacktestResultCache };

const VALID_PARAMS = { startDate: '2024-01-01', endDate: '2024-06-30', startingValue: 10000 };
const VALID_ASSETS = [{ ticker: 'AAPL', weight: 60 }, { ticker: 'BND', weight: 40 }];
const DEFAULT_PRICE_DATA = { AAPL: { '2024-01-02': 185.5, '2024-01-03': 186.0 }, BND: { '2024-01-02': 72.3, '2024-01-03': 72.5 } };

/** 在随机端口启动 Express 应用挂载 backtest 路由。 */
export const createBacktestApp = (routes: Router): Promise<TestServer> => startExpressApp((app) => app.use('/api/backtest', routes), { bodyLimit: '10mb' });

export const createValidRequestBody = () => ({ portfolios: [{ assets: VALID_ASSETS.map((a) => ({ ...a })), rebalanceFrequency: 'monthly' as const }], parameters: { ...VALID_PARAMS } });
export const createValidParameters = () => ({ ...VALID_PARAMS });
export const createValidPortfolio = () => ({ assets: VALID_ASSETS.map((a) => ({ ...a })), rebalanceFrequency: 'monthly' as const });

/** 配置 portfolio 端点默认 mock 并启动测试服务器。 */
export async function setupPortfolioServer(routes: Router, m: BacktestMockHandles): Promise<TestServer> {
  const { vi } = await import('vitest');
  vi.clearAllMocks();
  clearBacktestResultCache();
  m.fetchHistoryData.mockResolvedValue(DEFAULT_PRICE_DATA);
  m.runBacktest.mockResolvedValue({
    result: mockBacktestResult({
      portfolios: [{ name: 'Portfolio 0', growthCurve: [{ date: '2024-01-02', value: 10000 }, { date: '2024-01-03', value: 10100 }], rollingReturns: [] }],
    }),
  });
  return createBacktestApp(routes);
}

/** 启动引擎路由测试服务器（analysis/monte-carlo/optimize/efficient-frontier）。 */
export async function startEngineRouteServer(routes: Router, m: BacktestMockHandles): Promise<TestServer> {
  const { vi } = await import('vitest');
  vi.clearAllMocks();
  m.fetchHistoryData.mockResolvedValue(DEFAULT_PRICE_DATA);
  m.buildEngineParams.mockReturnValue({ startDate: '2024-01-01', endDate: '2024-06-30' });
  m.callEngineStrict.mockResolvedValue({});
  return createBacktestApp(routes);
}