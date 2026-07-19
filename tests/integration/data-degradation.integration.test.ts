/**
 * 数据降级链路集成测试（RO-049 SubTask 33.1）
 *
 * 验证数据获取降级链路：PostgreSQL → Go data-fetcher → 文件缓存。
 * 重点断言 degraded 标志的正确传播——当 DB 不可用或 Go 服务无法获取全部缺失
 * 标的时，consumeDegradedFlag() 必须返回 degraded:true（AGENTS.md 降级模式要求）。
 * 依赖模块（dataQueryService/dataCacheService/tickerValidation/OTel）被 mock。
 */
import { describe, it, expect, afterAll, vi } from 'vitest';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock('@opentelemetry/api', () => {
  const noopSpan = {
    setAttribute: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };
  return {
    trace: {
      getTracer: () => ({
        startActiveSpan: async <T>(_name: string, fn: (span: typeof noopSpan) => Promise<T>) =>
          fn(noopSpan),
      }),
    },
  };
});

const { queryPricesFromDbMock, fetchMissingFromGoServiceMock } = vi.hoisted(() => ({
  queryPricesFromDbMock: vi.fn(),
  fetchMissingFromGoServiceMock: vi.fn(),
}));

vi.mock('../../packages/backend/src/infrastructure/dataQueryService.js', () => ({
  queryPricesFromDb: queryPricesFromDbMock,
  fetchMissingFromGoService: fetchMissingFromGoServiceMock,
  isDbAvailable: vi.fn(() => true),
  pgCircuitBreaker: { stats: () => ({ state: 'closed' }) },
  callGoDataService: vi.fn(),
  validateSearchQuery: vi.fn(),
  searchTickersFromDb: vi.fn(),
  TickerSearchResult: class {},
}));

vi.mock('../../packages/backend/src/infrastructure/dataCacheService.js', () => ({
  readCache: vi.fn(async () => null),
  getCacheKey: vi.fn(() => 'cache-key'),
  writeCache: vi.fn(),
  CACHE_DIR: '/tmp/cache',
  currentCacheVersion: 1,
  incrementCacheVersion: vi.fn(),
  ensureCacheDir: vi.fn(),
  deletePriceCache: vi.fn(),
  clearPriceCache: vi.fn(),
}));

vi.mock('../../packages/backend/src/utils/tickerValidation.js', () => ({
  validateTickerFormat: vi.fn((tickers: string[]) => ({ valid: tickers, invalid: [] })),
}));

vi.mock('../../packages/backend/src/db/pool.js', () => ({
  initSchema: vi.fn(),
  getPool: vi.fn(),
  closeDb: vi.fn(),
  withTenant: vi.fn(),
}));

import { fetchHistoryData } from '../../packages/backend/src/services/dataService.js';

afterAll(() => {
  vi.restoreAllMocks();
});

describe('数据降级链路集成测试', () => {
  it('全部数据命中 DB 时不降级', async () => {
    queryPricesFromDbMock.mockResolvedValueOnce({
      result: { AAPL: { '2020-01-01': 100 }, MSFT: { '2020-01-01': 200 } },
      missing: [],
      dbDegraded: false,
    });

    const res = await fetchHistoryData(['AAPL', 'MSFT'], '2020-01-01', '2023-12-31');
    expect(res.degraded).toBe(false);
    expect(Object.keys(res.data)).toHaveLength(2);
  });

  it('DB 不可用时标记降级（dbDegraded=true）', async () => {
    queryPricesFromDbMock.mockResolvedValueOnce({
      result: {},
      missing: ['AAPL'],
      dbDegraded: true,
    });
    fetchMissingFromGoServiceMock.mockResolvedValueOnce({ AAPL: { '2020-01-01': 100 } });

    const res = await fetchHistoryData(['AAPL'], '2020-01-01', '2023-12-31');
    expect(res.degraded).toBe(true);
    expect(res.degradedWarning).toContain('数据库不可用');
  });

  it('缺失标的经 Go 服务补齐后不降级', async () => {
    queryPricesFromDbMock.mockResolvedValueOnce({
      result: { AAPL: { '2020-01-01': 100 } },
      missing: ['MSFT'],
      dbDegraded: false,
    });
    fetchMissingFromGoServiceMock.mockResolvedValueOnce({ MSFT: { '2020-01-01': 200 } });

    const res = await fetchHistoryData(['AAPL', 'MSFT'], '2020-01-01', '2023-12-31');
    expect(res.degraded).toBe(false);
    expect(res.data.MSFT).toBeDefined();
  });

  it('Go 服务无法获取全部缺失标的时标记降级', async () => {
    queryPricesFromDbMock.mockResolvedValueOnce({
      result: { AAPL: { '2020-01-01': 100 } },
      missing: ['UNKNOWN1', 'UNKNOWN2'],
      dbDegraded: false,
    });
    fetchMissingFromGoServiceMock.mockResolvedValueOnce({ UNKNOWN1: { '2020-01-01': 50 } });

    const res = await fetchHistoryData(
      ['AAPL', 'UNKNOWN1', 'UNKNOWN2'],
      '2020-01-01',
      '2023-12-31',
    );
    expect(res.degraded).toBe(true);
    expect(res.degradedWarning).toContain('Go 数据服务无法获取');
  });

  it('全部 ticker 非法时返回空结果不降级', async () => {
    const { validateTickerFormat } =
      await import('../../packages/backend/src/utils/tickerValidation.js');
    (validateTickerFormat as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      valid: [],
      invalid: ['!!!'],
    });

    const res = await fetchHistoryData(['!!!'], '2020-01-01', '2023-12-31');
    expect(res.data).toEqual({});
  });

  it('降级信息通过返回值传递（无全局状态）', async () => {
    queryPricesFromDbMock
      .mockResolvedValueOnce({ result: {}, missing: ['X'], dbDegraded: true })
      .mockResolvedValueOnce({ result: {}, missing: ['X'], dbDegraded: true });
    fetchMissingFromGoServiceMock.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    const res = await fetchHistoryData(['X'], '2020-01-01', '2023-12-31');
    expect(res.degraded).toBe(true);

    const res2 = await fetchHistoryData(['X'], '2020-01-01', '2023-12-31');
    expect(res2.degraded).toBe(true);
  });
});
