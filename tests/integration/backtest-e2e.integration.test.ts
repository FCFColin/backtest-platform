import '../helpers/loggerMock.js';
/**
 * 回测端到端集成测试（RO-049 SubTask 33.1）
 *
 * 跨层验证：Express 路由 → Zod 校验 → 数据获取 → 引擎调用 → 响应。
 * 重点断言 ADR-008 fail-closed：引擎不可用时返回 503 + Retry-After，绝不静默本地计算。
 * 引擎与数据服务被 mock 以避免真实外部依赖。
 */
import { describe, it, expect, vi } from 'vitest';
import { useTestServer } from '../helpers/expressApp.js';
import { engineMocks } from '../helpers/engineFixture.js';

const { callEngineStrictMock, fetchHistoryDataMock, searchTickersMock } = vi.hoisted(() => ({
  callEngineStrictMock: vi.fn(),
  fetchHistoryDataMock: vi.fn(),
  searchTickersMock: vi.fn(),
}));

vi.mock('../../packages/backend/src/utils/engineClient.js', () => ({
  ...engineMocks,
  callEngineStrict: callEngineStrictMock,
}));

vi.mock('../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: fetchHistoryDataMock,
  searchTickers: searchTickersMock,
}));

vi.mock('../../packages/backend/src/application/backtest/backtestResultUtils.js', () => ({
  compressBacktestResultForSync: vi.fn((r) => r),
  extractBacktestSeries: vi.fn(() => ({})),
  backtestCacheKey: vi.fn(() => 'cache-key'),
  getBacktestResultCache: vi.fn(() => null),
  setBacktestResultCache: vi.fn(),
}));

vi.mock('../../packages/backend/src/db/macroData.js', () => ({
  loadCpiSeriesFromDb: vi.fn(async () => []),
  loadExchangeRatesFromDb: vi.fn(async () => ({})),
}));

vi.mock('../../packages/backend/src/infrastructure/cpiLoader.js', () => ({
  loadCpiMap: vi.fn(async () => ({})),
  fetchCpiFromGoService: vi.fn(async () => null),
}));

import backtestRoutes from '../../packages/backend/src/routes/backtestRoutes.js';

const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'backtest-e2e-user';
const server = useTestServer('/api/v1/backtest', backtestRoutes, {
  auth: {
    user: { sub: userId, role: 'admin', tenant_id: orgId, org_role: 'owner' },
    tenantId: orgId,
  },
});

const validOptimizeBody = {
  tickers: ['AAPL', 'MSFT'],
  objective: 'maxSharpe',
  parameters: { startDate: '2020-01-01', endDate: '2023-12-31' },
};

const mockPriceData = () =>
  fetchHistoryDataMock.mockResolvedValueOnce({
    data: {
      AAPL: { '2020-01-01': 100 },
      MSFT: { '2020-01-01': 200 },
    },
    degraded: false,
  });

describe('回测端到端集成测试', () => {
  it('GET /search 返回 ticker 搜索结果', async () => {
    searchTickersMock.mockResolvedValueOnce([
      { ticker: 'AAPL', name: 'Apple Inc.' },
      { ticker: 'MSFT', name: 'Microsoft Corp.' },
    ]);
    const { res, body } = await server.get('/search?query=aap&limit=10');
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].ticker).toBe('AAPL');
  });

  it('GET /search 缺少 query 参数返回 422', async () => {
    const { res } = await server.get('/search?limit=10');
    expect(res.status).toBe(422);
  });

  it('POST /optimize 引擎正常返回 200 + 优化结果', async () => {
    mockPriceData();
    callEngineStrictMock.mockResolvedValueOnce({
      optimalWeights: { AAPL: 0.6, MSFT: 0.4 },
      sharpe: 1.8,
    });

    const { res, body } = await server.post('/optimize', validOptimizeBody);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.optimalWeights).toEqual({ AAPL: 0.6, MSFT: 0.4 });
  });

  it('POST /optimize 引擎不可用时 fail-closed 返回 503（ADR-008）', async () => {
    mockPriceData();
    callEngineStrictMock.mockRejectedValueOnce(
      new engineMocks.EngineUnavailableError('/api/engine/optimize'),
    );

    const { res, body } = await server.post('/optimize', validOptimizeBody);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(body.error.code).toBe('ENGINE_UNAVAILABLE');
    expect(body.degraded).toBeUndefined();
    expect(body.degradedWarning).toBeUndefined();
  });

  it('POST /optimize 非法 objective 返回校验错误', async () => {
    const { res } = await server.post('/optimize', { ...validOptimizeBody, objective: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('POST /optimize 空 tickers 数组返回校验错误', async () => {
    const { res } = await server.post('/optimize', { ...validOptimizeBody, tickers: [] });
    expect(res.status).toBe(400);
  });

  it('POST /optimize startDate 晚于 endDate 返回校验错误', async () => {
    const { res } = await server.post('/optimize', {
      ...validOptimizeBody,
      parameters: { startDate: '2023-12-31', endDate: '2020-01-01' },
    });
    expect(res.status).toBe(400);
  });
});
