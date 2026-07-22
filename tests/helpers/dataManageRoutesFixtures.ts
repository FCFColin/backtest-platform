/**
 * 测试辅助：dataManageRoutes 共享 fixtures
 *
 * 企业理由：data-manage-routes 测试在多个 describe 块中重复定义 app factory、
 * engine/dataFetch 服务 mock 工厂与 mock stats。抽到共享模块便于复用与维护，
 * 新增端点或调整 mock 默认值只需修改一处。
 *
 * 用法：
 *   import {
 *     engineServiceMocks,
 *     dataFetchMocks,
 *     startApp,
 *     startAppUnauthenticated,
 *     createMockStats,
 *     dataManageRoutes,
 *   } from '../../helpers/dataManageRoutesFixtures.js';
 */

import { vi } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from './expressApp.js';
import { createLoggerMocks } from './mockFactories.js';

// vi.hoisted 结果不能直接 export（Vitest 转换会抛 SyntaxError: Cannot export
// hoisted variable）。统一创建到 internalMocks 内部容器，vi.mock 工厂与对外
// 导出均通过属性引用获取，确保引用在工厂执行时已绑定且不触发导出限制。
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

vi.mock(
  '../../packages/backend/src/infrastructure/tickerDataService.js',
  () => internalMocks.engine,
);
vi.mock('../../packages/backend/src/infrastructure/dataFetch.js', () => internalMocks.dataFetch);
// dataManageRoutes 已直接从 db/marketStats.js 与 services/dataService.js 取函数，
// 因此对这两个模块也注入同一组 mock 引用，使 engineServiceMocks.* 调用仍生效。
vi.mock('../../packages/backend/src/db/marketStats.js', () => ({
  scanMarketStatsFromDb: internalMocks.engine.scanMarketStatsFromDb,
}));
vi.mock('../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  searchTickers: internalMocks.engine.searchTickers,
}));
vi.mock('../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import dataManageRoutes from '../../packages/backend/src/routes/dataManageRoutes.js';

/** 引擎服务 mock 集合（与 vi.mock 工厂返回同一对象引用） */
export const engineServiceMocks = internalMocks.engine;
/** 数据更新服务 mock 集合（与 vi.mock 工厂返回同一对象引用） */
export const dataFetchMocks = internalMocks.dataFetch;

/**
 * 启动带鉴权注入的测试服务。
 *
 * 写端点受 requirePermission(DATA_MANAGE) 保护，需前置认证注入 req.user。
 * 通过 authRole 控制注入的角色：
 * - 'admin'/'analyst'：具备 DATA_MANAGE 权限，应放行；
 * - 'readonly'：无 DATA_MANAGE 权限，应 403；
 * - null：不注入 user（模拟未认证），应 401。
 *
 * @param authRole - 注入角色，默认 'admin'
 * @returns 测试服务器句柄
 */
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

/**
 * 启动不带鉴权注入的测试服务（用于只读端点）。
 *
 * @returns 测试服务器句柄
 */
export async function startAppUnauthenticated(): Promise<TestServer> {
  return startExpressApp((app) => {
    app.use('/api/v1/data/manage', dataManageRoutes);
  });
}

/**
 * 创建市场统计 mock 数据。
 *
 * @returns 完整的 MarketStats mock 对象
 */
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
