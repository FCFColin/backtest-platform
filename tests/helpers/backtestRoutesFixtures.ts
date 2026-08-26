import { vi } from 'vitest';
import type { RequestHandler, Router } from 'express';
import { startExpressApp, type TestServer, type TestRequest } from './expressApp.js';
import { mockBacktestResult, mockPortfolioResult } from './storeFixtures.js';
import type { Portfolio, BacktestParameters } from '@backtest/shared';

type MockFn = ReturnType<typeof vi.fn>;

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
}

interface ServiceMockConfig {
  mockFn: MockFn;
  enginePath: string;
  extractTickers: (...args: unknown[]) => string[];
  extractStartDate: (...args: unknown[]) => string;
  extractEndDate: (...args: unknown[]) => string;
  buildEnginePayload?: (...args: unknown[]) => Record<string, unknown>;
  multiPortfolio?: boolean;
  capIterations?: boolean;
  /** 对引擎返回值做后处理（如 assets→tickers 映射） */
  transformResult?: (result: unknown) => unknown;
  /** 是否用标准 { data, warnings, dateRange } 包装返回值 */
  wrapResult?: boolean;
}

function configureServiceMock(m: BacktestMockHandles, config: ServiceMockConfig): void {
  config.mockFn.mockImplementation(async (...args: unknown[]) => {
    const tickers = config.extractTickers(...args);
    const startDate = config.extractStartDate(...args);
    const endDate = config.extractEndDate(...args);
    await m.fetchHistoryData(tickers, startDate, endDate);

    if (config.multiPortfolio) {
      const portfolios = args[0] as unknown[];
      const mcParams = args[2] as object | undefined;
      const results = await Promise.all(
        portfolios.map(() => m.callEngineStrict(config.enginePath, { mcParams })),
      );
      return {
        data: portfolios.length === 1 ? results[0] : results,
        warnings: [],
        dateRange: undefined,
      };
    }

    let payload = config.buildEnginePayload ? config.buildEnginePayload(...args) : { tickers };
    if (config.capIterations) {
      const raw = args[4] as number | { numIterations?: number } | undefined;
      const numIterations = typeof raw === 'object' ? raw?.numIterations : raw;
      payload = {
        ...payload,
        numIterations: numIterations ? Math.min(numIterations, 100000) : 10000,
      };
    }

    const result = await m.callEngineStrict(config.enginePath, payload);
    const raw = (result as { data?: Record<string, unknown> })?.data ?? result;
    const value = config.transformResult ? config.transformResult(raw) : raw;
    if (config.wrapResult) return { data: value, warnings: [], dateRange: undefined };
    return value;
  });
}

export function configureAnalysisMocks(m: BacktestMockHandles): void {
  configureServiceMock(m, {
    mockFn: m.runAnalysis,
    enginePath: '/api/engine/analysis',
    extractTickers: (tickers) => tickers as string[],
    extractStartDate: (_t, params) => (params as { startDate: string }).startDate,
    extractEndDate: (_t, params) => (params as { endDate: string }).endDate,
    buildEnginePayload: (tickers) => ({ tickers }),
    transformResult: (r) => {
      const d = r as { assets?: unknown[]; correlations?: unknown[][] };
      return d?.assets ? { tickers: d.assets, correlations: d.correlations || [] } : r;
    },
    wrapResult: true,
  });
}

export function configureMonteCarloMocks(m: BacktestMockHandles): void {
  configureServiceMock(m, {
    mockFn: m.runMonteCarlo,
    enginePath: '/api/engine/monte-carlo',
    extractTickers: () => [],
    extractStartDate: () => '',
    extractEndDate: () => '',
    multiPortfolio: true,
    wrapResult: true,
  });
}

export function configureOptimizationMocks(m: BacktestMockHandles): void {
  const extractOptDates = (...args: unknown[]) => {
    const params = args[3] as { startDate: string; endDate: string };
    return params;
  };
  configureServiceMock(m, {
    mockFn: m.runOptimization,
    enginePath: '/api/engine/optimize',
    extractTickers: (...args) => args[0] as string[],
    extractStartDate: (...a) => extractOptDates(...a).startDate,
    extractEndDate: (...a) => extractOptDates(...a).endDate,
    buildEnginePayload: (...args) => ({
      tickers: args[0],
      objective: args[1],
      constraints: args[2],
    }),
    capIterations: true,
  });
  configureServiceMock(m, {
    mockFn: m.runEfficientFrontier,
    enginePath: '/api/engine/efficient-frontier',
    extractTickers: (...args) => args[0] as string[],
    extractStartDate: (_t, p) => (p as { startDate: string }).startDate,
    extractEndDate: (_t, p) => (p as { endDate: string }).endDate,
    buildEnginePayload: () => ({}),
  });
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

const VALID_PARAMS: BacktestParameters = {
  startDate: '2024-01-01',
  endDate: '2024-06-30',
  startingValue: 10000,
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: '',
};
const VALID_ASSETS = [
  { ticker: 'AAPL', weight: 60 },
  { ticker: 'BND', weight: 40 },
];
const VALID_PORTFOLIOS: Portfolio[] = [
  {
    id: 'pf-test-001',
    name: '测试组合',
    assets: VALID_ASSETS.map((a) => ({ ...a })),
    rebalanceFrequency: 'monthly',
  },
];
const DEFAULT_PRICE_DATA = {
  AAPL: { '2024-01-02': 185.5, '2024-01-03': 186.0 },
  BND: { '2024-01-02': 72.3, '2024-01-03': 72.5 },
};

interface BacktestServerOptions {
  auth?: { user?: Partial<NonNullable<TestRequest['user']>>; tenantId?: string };
  middleware?: RequestHandler[];
}

// 与生产 app.ts 挂载一致（/api/v1/backtest），statusUrl 契约才能闭环
export const createBacktestApp = (
  routes: Router,
  opts: BacktestServerOptions = {},
): Promise<TestServer> =>
  startExpressApp(
    (app) => {
      if (opts.auth) {
        app.use((req: TestRequest, _res, next) => {
          if (opts.auth!.user) req.user = { sub: 'test-user', role: 'admin', ...opts.auth!.user };
          if (opts.auth!.tenantId !== undefined) req.tenantId = opts.auth!.tenantId;
          next();
        });
      }
      for (const mw of opts.middleware ?? []) app.use(mw);
      app.use('/api/v1/backtest', routes);
    },
    { bodyLimit: '10mb' },
  );

export const createValidRequestBody = () => ({
  portfolios: VALID_PORTFOLIOS.map((p) => ({ ...p, assets: p.assets.map((a) => ({ ...a })) })),
  parameters: { ...VALID_PARAMS },
});
export const createValidParameters = (): BacktestParameters => ({ ...VALID_PARAMS });
export const createValidPortfolio = (): Portfolio => ({
  ...VALID_PORTFOLIOS[0]!,
  assets: VALID_ASSETS.map((a) => ({ ...a })),
});

export async function setupPortfolioServer(
  routes: Router,
  m: BacktestMockHandles,
  opts: BacktestServerOptions = {},
): Promise<TestServer> {
  const { vi } = await import('vitest');
  vi.clearAllMocks();
  m.fetchHistoryData.mockResolvedValue(DEFAULT_PRICE_DATA);
  m.runBacktest.mockResolvedValue({
    result: mockBacktestResult({
      portfolios: [
        mockPortfolioResult({
          name: 'Portfolio 0',
          growthCurve: [
            { date: '2024-01-02', value: 10000 },
            { date: '2024-01-03', value: 10100 },
          ],
          rollingReturns: [],
        }),
      ],
    }),
  });
  return createBacktestApp(routes, opts);
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
