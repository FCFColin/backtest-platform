import type { Router } from 'express';
import { startExpressApp, type TestServer } from './expressApp.js';
import { mockBacktestResult } from './storeFixtures.js';
import { ValidationError } from '../../packages/backend/src/utils/errors.js';
import {
  setBacktestResultCache,
  backtestCacheKey,
  compressBacktestResultForSync,
} from '../../packages/backend/src/application/backtest/backtestResultUtils.js';

type MockFn = ReturnType<(typeof import('vitest'))['fn']>;

export class EngineUnavailableErrorStub extends Error {
  readonly retryAfterSeconds: number;
  readonly code = 'ENGINE_UNAVAILABLE';
  constructor(endpoint = 'engine', retryAfterSeconds = 30) {
    super(`计算引擎暂不可用（${endpoint}），请稍后重试`);
    this.name = 'EngineUnavailableError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface BacktestMockHandles {
  runBacktest: MockFn;
  runPortfolioBacktest: MockFn;
  runAnalysis: MockFn;
  runMonteCarlo: MockFn;
  runOptimization: MockFn;
  runEfficientFrontier: MockFn;
  fetchHistoryData: MockFn;
  searchTickers: MockFn;
  callEngineStrict: MockFn;
  buildEngineParams: MockFn;
  preparePortfolioBacktest: MockFn;
  collectInvalidTickerWarnings: MockFn;
  collectDomainTickers: MockFn;
  filterPriceData: MockFn;
  fetchPriceDataWithRange: MockFn;
  loadMacroData: MockFn;
  validateTickers: MockFn;
  portfolioToDomain: MockFn;
  sanitizeMcParams: MockFn;
}

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
      const priceData = (await m.fetchHistoryData(
        Array.from(allTickers),
        parameters.startDate,
        parameters.endDate,
      )) as Record<string, Record<string, number>>;
      const invalidTickers: string[] = [];
      for (const ticker of allTickers) {
        if (!priceData[ticker] || Object.keys(priceData[ticker]).length === 0)
          invalidTickers.push(ticker);
      }
      if (invalidTickers.length > 0)
        throw new ValidationError(
          `以下标的代码无效：${invalidTickers.join(', ')}`,
          'INVALID_TICKERS',
        );
      const { result } = await m.runBacktest({
        portfolios,
        parameters,
        priceData,
        tenantId,
        ownerUserId,
      });
      void setBacktestResultCache(backtestCacheKey(portfolios, parameters, tenantId), result);
      return { result: compressBacktestResultForSync(result), warnings };
    },
  );

  m.collectInvalidTickerWarnings.mockImplementation(() => []);
}

export function configureAnalysisMocks(m: BacktestMockHandles): void {
  m.runAnalysis.mockImplementation(async (tickers: string[], parameters: unknown) => {
    const params = parameters as { startDate: string; endDate: string };
    await m.fetchHistoryData(tickers, params.startDate, params.endDate);
    const result = await m.callEngineStrict('/api/engine/analysis', { tickers });
    const engineData = result as { assets?: unknown[]; correlations?: unknown[][] };
    return {
      data: engineData?.assets
        ? { tickers: engineData.assets, correlations: engineData.correlations || [] }
        : result,
      warnings: [],
      dateRange: undefined,
    };
  });
}

export function configureMonteCarloMocks(m: BacktestMockHandles): void {
  m.runMonteCarlo.mockImplementation(
    async (portfolioList: unknown[], _parameters: unknown, mcParams?: object) => {
      const results = await Promise.all(
        (portfolioList as unknown[]).map(() =>
          m.callEngineStrict('/api/engine/monte-carlo', { mcParams }),
        ),
      );
      return {
        data: portfolioList.length === 1 ? results[0] : results,
        warnings: [],
        dateRange: undefined,
      };
    },
  );

  const MC_ALLOWED = new Set([
    'numSimulations',
    'blockSize',
    'withReplacement',
    'confidenceLevel',
    'distribution',
    'seed',
  ]);
  m.sanitizeMcParams.mockImplementation((mcParams: object | undefined) => {
    if (!mcParams || typeof mcParams !== 'object' || Array.isArray(mcParams)) return {};
    const raw = mcParams as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(raw)) if (MC_ALLOWED.has(key)) sanitized[key] = raw[key];
    return sanitized;
  });
}

export function configureOptimizationMocks(m: BacktestMockHandles): void {
  const extractData = (result: unknown) =>
    (result as { data?: Record<string, unknown> })?.data ?? result;
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
      return extractData(
        await m.callEngineStrict('/api/engine/optimize', {
          tickers,
          objective,
          constraints,
          numIterations: cappedIterations,
        }),
      );
    },
  );
  m.runEfficientFrontier.mockImplementation(
    async (tickers: string[], parameters: { startDate: string; endDate: string }) => {
      await m.fetchHistoryData(tickers, parameters.startDate, parameters.endDate);
      return extractData(await m.callEngineStrict('/api/engine/efficient-frontier', {}));
    },
  );
}

export function configureTickerHelpersMocks(m: BacktestMockHandles): void {
  m.collectDomainTickers.mockImplementation(
    (domainPortfolios: { tickers: string[] }[], benchmarkTicker: string) => {
      const allTickers = new Set<string>();
      for (const p of domainPortfolios) for (const ticker of p.tickers) allTickers.add(ticker);
      if (benchmarkTicker) allTickers.add(benchmarkTicker);
      return allTickers;
    },
  );
  m.filterPriceData.mockImplementation(
    (priceData: Record<string, Record<string, number>>, tickers: Set<string>) => {
      const filtered: Record<string, Record<string, number>> = {};
      for (const ticker of tickers) if (priceData[ticker]) filtered[ticker] = priceData[ticker];
      return filtered;
    },
  );
  m.fetchPriceDataWithRange.mockImplementation(
    async (tickers: string[], startDate: string, endDate: string) => {
      const r = (await m.fetchHistoryData(tickers, startDate, endDate)) as {
        data: Record<string, Record<string, number>>;
        degraded: boolean;
        degradedWarning?: string;
      };
      return {
        priceData: r.data || {},
        effectiveStartDate: startDate,
        effectiveEndDate: endDate,
        degraded: r.degraded ?? false,
        degradedWarning: r.degradedWarning,
      };
    },
  );
  m.loadMacroData.mockImplementation(async () => ({ cpiData: {}, exchangeRates: {} }));
}

const VALID_PARAMS = { startDate: '2024-01-01', endDate: '2024-06-30', startingValue: 10000 };
const VALID_ASSETS = [
  { ticker: 'AAPL', weight: 60 },
  { ticker: 'BND', weight: 40 },
];
const DEFAULT_PRICE_DATA = {
  AAPL: { '2024-01-02': 185.5, '2024-01-03': 186.0 },
  BND: { '2024-01-02': 72.3, '2024-01-03': 72.5 },
};

export const createBacktestApp = (routes: Router): Promise<TestServer> =>
  startExpressApp((app) => app.use('/api/backtest', routes), { bodyLimit: '10mb' });

export const createValidRequestBody = () => ({
  portfolios: [
    { assets: VALID_ASSETS.map((a) => ({ ...a })), rebalanceFrequency: 'monthly' as const },
  ],
  parameters: { ...VALID_PARAMS },
});
export const createValidParameters = () => ({ ...VALID_PARAMS });
export const createValidPortfolio = () => ({
  assets: VALID_ASSETS.map((a) => ({ ...a })),
  rebalanceFrequency: 'monthly' as const,
});

export async function setupPortfolioServer(
  routes: Router,
  m: BacktestMockHandles,
): Promise<TestServer> {
  const { vi } = await import('vitest');
  vi.clearAllMocks();
  m.fetchHistoryData.mockResolvedValue(DEFAULT_PRICE_DATA);
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
  });
  return createBacktestApp(routes);
}

export async function startEngineRouteServer(
  routes: Router,
  m: BacktestMockHandles,
): Promise<TestServer> {
  const { vi } = await import('vitest');
  vi.clearAllMocks();
  m.fetchHistoryData.mockResolvedValue(DEFAULT_PRICE_DATA);
  m.buildEngineParams.mockReturnValue({ startDate: '2024-01-01', endDate: '2024-06-30' });
  m.callEngineStrict.mockResolvedValue({});
  return createBacktestApp(routes);
}
