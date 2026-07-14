/**
 * 回测端到端集成测试（RO-049 SubTask 33.1）
 *
 * 跨层验证：Express 路由 → Zod 校验 → 数据获取 → 引擎调用 → 响应。
 * 重点断言 ADR-031 fail-closed：引擎不可用时返回 503 + degraded，绝不静默本地计算。
 * 引擎与数据服务被 mock 以避免真实外部依赖。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

const callEngineStrictMock = vi.fn();
const EngineUnavailableError = class EngineUnavailableError extends Error {
  retryAfterSeconds: number;
  constructor(endpoint: string, retryAfterSeconds = 30) {
    super(`Go 引擎不可用: ${endpoint}`);
    this.name = 'EngineUnavailableError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
};

vi.mock('../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: callEngineStrictMock,
  EngineUnavailableError,
  resetEngineAvailability: vi.fn(),
  callGoEngineDirect: vi.fn(),
}));

const fetchHistoryDataMock = vi.fn();
const searchTickersMock = vi.fn();

vi.mock('../../packages/backend/src/services/dataService.js', () => ({
  fetchHistoryData: fetchHistoryDataMock,
  searchTickers: searchTickersMock,
  consumeDegradedFlag: vi.fn(() => ({ degraded: false })),
}));

vi.mock('../../packages/backend/src/utils/compressBacktestResult.js', () => ({
  compressBacktestResultForSync: vi.fn((r) => r),
  extractBacktestSeries: vi.fn(() => ({})),
}));

vi.mock('../../packages/backend/src/utils/backtestResultCache.js', () => ({
  backtestCacheKey: vi.fn(() => 'cache-key'),
  getBacktestResultCache: vi.fn(() => null),
  setBacktestResultCache: vi.fn(),
}));

vi.mock('../../packages/backend/src/db/macroData.js', () => ({
  loadCpiMapFromDb: vi.fn(async () => ({})),
  loadExchangeRatesFromDb: vi.fn(async () => ({})),
}));

import express from 'express';
import backtestRoutes from '../../packages/backend/src/routes/backtestRoutes.js';
import { mockAuthMiddleware } from '../helpers/testcontainersPg.js';

const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'backtest-e2e-user';
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(mockAuthMiddleware(orgId, userId));
  app.use('/api/v1/backtest', backtestRoutes);

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

const validOptimizeBody = {
  tickers: ['AAPL', 'MSFT'],
  objective: 'maxSharpe',
  parameters: { startDate: '2020-01-01', endDate: '2023-12-31' },
};

describe('回测端到端集成测试', () => {
  it('GET /search 返回 ticker 搜索结果', async () => {
    searchTickersMock.mockResolvedValueOnce([
      { ticker: 'AAPL', name: 'Apple Inc.' },
      { ticker: 'MSFT', name: 'Microsoft Corp.' },
    ]);
    const res = await fetch(`${baseUrl}/api/v1/backtest/search?query=aap&limit=10`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].ticker).toBe('AAPL');
  });

  it('GET /search 缺少 query 参数返回 422', async () => {
    const res = await fetch(`${baseUrl}/api/v1/backtest/search?limit=10`);
    expect(res.status).toBe(422);
  });

  it('POST /optimize 引擎正常返回 200 + 优化结果', async () => {
    fetchHistoryDataMock.mockResolvedValueOnce({
      AAPL: { '2020-01-01': 100 },
      MSFT: { '2020-01-01': 200 },
    });
    callEngineStrictMock.mockResolvedValueOnce({
      success: true,
      data: { optimalWeights: { AAPL: 0.6, MSFT: 0.4 }, sharpe: 1.8 },
    });

    const res = await fetch(`${baseUrl}/api/v1/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validOptimizeBody),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.optimalWeights).toEqual({ AAPL: 0.6, MSFT: 0.4 });
  });

  it('POST /optimize 引擎不可用时 fail-closed 返回 503 + degraded（ADR-031）', async () => {
    fetchHistoryDataMock.mockResolvedValueOnce({
      AAPL: { '2020-01-01': 100 },
      MSFT: { '2020-01-01': 200 },
    });
    callEngineStrictMock.mockRejectedValueOnce(
      new EngineUnavailableError('/api/engine/optimize', 30),
    );

    const res = await fetch(`${baseUrl}/api/v1/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validOptimizeBody),
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    const json = await res.json();
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
    expect(json.degraded).toBe(true);
    expect(json.degradedWarning).toBeDefined();
  });

  it('POST /optimize 非法 objective 返回校验错误', async () => {
    const res = await fetch(`${baseUrl}/api/v1/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validOptimizeBody, objective: 'invalid' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /optimize 空 tickers 数组返回校验错误', async () => {
    const res = await fetch(`${baseUrl}/api/v1/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validOptimizeBody, tickers: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /optimize startDate 晚于 endDate 返回校验错误', async () => {
    const res = await fetch(`${baseUrl}/api/v1/backtest/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validOptimizeBody,
        parameters: { startDate: '2023-12-31', endDate: '2020-01-01' },
      }),
    });
    expect(res.status).toBe(400);
  });
});
