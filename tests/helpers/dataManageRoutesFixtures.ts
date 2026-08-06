import { vi } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from './expressApp.js';
import { loggerMocks } from './loggerFixture.js';

// vi.hoisted 结果不能直接 export（Vitest 转换会抛 SyntaxError: Cannot export
// hoisted variable）。统一创建到 internalMocks 内部容器，vi.mock 工厂与对外
const internalMocks = vi.hoisted(() => ({
  engine: {
    getEngineStatus: vi.fn(),
    getTickerList: vi.fn(),
    searchTickers: vi.fn(),
    loadTickerData: vi.fn(),
    scanMarketStatsFromDb: vi.fn(),
    resolveUniverseFromCacheStats: vi.fn(),
  },
  dataFetch: {
    startUpdate: vi.fn(),
    stopUpdate: vi.fn(),
    getUpdateStatus: vi.fn(),
  },
}));

vi.mock('../../packages/backend/src/infrastructure/dataQuery.js', () => internalMocks.engine);
vi.mock('../../packages/backend/src/infrastructure/dataServices.js', () => internalMocks.dataFetch);
// dataManageRoutes 已直接从 db/marketStats.js 与 services/dataService.js 取函数，
vi.mock('../../packages/backend/src/db/marketStats.js', () => ({
  scanMarketStatsFromDb: internalMocks.engine.scanMarketStatsFromDb,
}));
vi.mock('../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  searchTickers: internalMocks.engine.searchTickers,
}));
vi.mock('../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));

import dataManageRoutes from '../../packages/backend/src/routes/dataManageRoutes.js';

export const engineServiceMocks = internalMocks.engine;
export const dataFetchMocks = internalMocks.dataFetch;

export async function startApp(
  authRole: 'admin' | 'analyst' | 'readonly' | null = 'admin',
): Promise<TestServer> {
  return startExpressApp((app) => {
    if (authRole) {
      app.use((req: TestRequest, _res, next) => {
        req.user = {
          sub: 'test-user',
          role: authRole,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900,
        };
        next();
      });
    }
    app.use('/api/v1/data/manage', dataManageRoutes);
  });
}

export async function startAppUnauthenticated(): Promise<TestServer> {
  return startExpressApp((app) => {
    app.use('/api/v1/data/manage', dataManageRoutes);
  });
}

export function createMockStats() {
  return {
    total_cached: 50,
    by_market: { US: 40, CN: 10 },
    by_type: { stock: 30, etf: 20 },
    by_exchange: { NYSE: 30, NASDAQ: 20 },
    date_ranges: { earliest: '2015-01-01', latest: '2024-06-30' },
    by_decade: {},
    by_year_count: {},
    coverage: {
      tickers_with_5y_plus: 40,
      tickers_with_10y_plus: 30,
      tickers_with_20y_plus: 10,
      avg_data_points: 2000,
      median_data_points: 1800,
    },
    data_quality: {
      with_adj_close: 50,
      with_dividends: 20,
      with_splits: 5,
      total_data_points: 100000,
      total_size_mb: 50.0,
    },
    recent_updates: [],
    sample_tickers: {},
    generated_at: '2024-06-30T00:00:00Z',
  };
}
