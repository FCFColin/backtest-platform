import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks, mockLogger } from '../../helpers/mockFactories.js';

const loggerMocks = vi.hoisted(() => ({}) as ReturnType<typeof createLoggerMocks>);

const tickerValidationMocks = vi.hoisted(() => ({
  isValidTicker: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const pgMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

const marketStatsMocks = vi.hoisted(() => ({
  scanMarketStatsFromDb: vi.fn(),
  getDbEngineStatus: vi.fn(),
}));

const goMocks = vi.hoisted(() => ({
  callGoDataService: vi.fn(),
}));

const macroDbMocks = vi.hoisted(() => ({
  loadCpiSeriesFromDb: vi.fn(),
}));

const fsPromisesMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => {
  Object.assign(loggerMocks, createLoggerMocks());
  return { logger: mockLogger(loggerMocks) };
});

vi.mock('../../../packages/backend/src/utils/tickerValidation.js', () => ({
  isValidTicker: tickerValidationMocks.isValidTicker,
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getReadPool: () => ({ query: pgMocks.query }),
}));

vi.mock('../../../packages/backend/src/db/marketStats.js', () => ({
  scanMarketStatsFromDb: marketStatsMocks.scanMarketStatsFromDb,
  getDbEngineStatus: marketStatsMocks.getDbEngineStatus,
}));

vi.mock('../../../packages/backend/src/infrastructure/dataQuery.js', () => ({
  callGoDataService: goMocks.callGoDataService,
}));

vi.mock('../../../packages/backend/src/db/macroData.js', () => ({
  loadCpiSeriesFromDb: macroDbMocks.loadCpiSeriesFromDb,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: fsMocks.existsSync,
    readFileSync: fsMocks.readFileSync,
    statSync: fsMocks.statSync,
    readdirSync: fsMocks.readdirSync,
    writeFileSync: fsMocks.writeFileSync,
    mkdirSync: fsMocks.mkdirSync,
    promises: fsPromisesMocks,
  },
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
  statSync: fsMocks.statSync,
  readdirSync: fsMocks.readdirSync,
  writeFileSync: fsMocks.writeFileSync,
  mkdirSync: fsMocks.mkdirSync,
}));

import {
  getEngineStatus,
  getTickerList,
  loadTickerData,
  getUniverseStats,
  scanTickersStats,
  resolveUniverseFromCacheStats,
} from '../../../packages/backend/src/infrastructure/tickerDataService.js';
import {
  loadCpiMap,
  fetchCpiForRoute,
} from '../../../packages/backend/src/infrastructure/dataServices.js';

beforeEach(() => vi.clearAllMocks());

const DB_STATS = {
  generated_at: '2024-01-01T00:00:00Z',
  total_cached: 100,
  by_market: {
    US: { count: 60, stocks: 50, etfs: 10, indices: 0 },
    CN: { count: 40, stocks: 35, etfs: 5, indices: 0 },
  },
  by_type: { STOCK: 85, ETF: 15 },
  by_exchange: {},
  date_ranges: { earliest: '1970-01-02', latest: '2024-01-01' },
  by_decade: {},
  by_year_count: {},
  coverage: {
    tickers_with_5y_plus: 0,
    tickers_with_10y_plus: 0,
    tickers_with_20y_plus: 0,
    avg_data_points: 0,
    median_data_points: 0,
  },
  data_quality: {
    with_adj_close: 0,
    with_dividends: 0,
    with_splits: 0,
    total_data_points: 0,
    total_size_mb: 0,
  },
  recent_updates: [],
  sample_tickers: {},
};

describe('getEngineStatus', () => {
  it.each([
    [
      'stats 缓存不存在时应返回零值状态',
      () => marketStatsMocks.getDbEngineStatus.mockRejectedValue(new Error('db down')),
      { totalTickers: 0, cachedTickers: 0, lastUpdate: null, progress: null, universeAge: null },
    ],
    [
      '应从 PostgreSQL 获取引擎状态',
      () =>
        marketStatsMocks.getDbEngineStatus.mockResolvedValue({
          totalTickers: 42,
          cachedTickers: 42,
          lastUpdate: '2024-06-01T00:00:00Z',
        }),
      { totalTickers: 42, cachedTickers: 42, lastUpdate: '2024-06-01T00:00:00Z', progress: null },
    ],
  ])('%s', async (_n, setup, expected) => {
    setup();
    const status = await getEngineStatus();
    expect(status).toMatchObject(expected);
  });
});

describe('loadTickerData', () => {
  const priceRow = () => ({
    date: new Date('2024-01-02'),
    open: 1,
    high: 2,
    low: 1,
    close: 185.5,
    volume: 100,
    adjusted_close: 185.5,
  });

  it('合法 ticker 应从 PostgreSQL 读取', async () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(true);
    pgMocks.query.mockResolvedValue({ rows: [priceRow()] });
    const result = await loadTickerData('AAPL');
    expect(result?.meta).toEqual({ ticker: 'AAPL' });
    expect((result?.prices as Array<{ close: number }>)[0].close).toBe(185.5);
  });

  it.each(['invalid@@@', '../../etc/passwd', '..\\..\\windows\\system32', ''])(
    '非法/路径遍历/空 ticker %s 应返回 null 且不查 DB',
    async (input) => {
      tickerValidationMocks.isValidTicker.mockReturnValue(false);
      expect(await loadTickerData(input)).toBeNull();
      expect(loggerMocks.warn).toHaveBeenCalledWith(expect.stringContaining('拒绝非法 ticker'));
      expect(pgMocks.query).not.toHaveBeenCalled();
    },
  );

  it('无数据时应返回 null', async () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(true);
    pgMocks.query.mockResolvedValue({ rows: [] });
    expect(await loadTickerData('UNKNOWN')).toBeNull();
  });
});

describe('getTickerList', () => {
  it.each([
    [
      '应从 PostgreSQL 读取标的列表',
      {
        rows: [
          { ticker: 'AAPL', category: 'Apple', market: 'US' },
          { ticker: 'BND', category: 'ETF', market: 'US' },
        ],
      },
      2,
      'AAPL',
    ],
    ['PostgreSQL 查询失败时应返回空数组', undefined, 0, undefined],
  ])('%s', async (_n, rows, len, first) => {
    if (rows) pgMocks.query.mockResolvedValue(rows);
    else pgMocks.query.mockRejectedValue(new Error('db down'));
    const result = await getTickerList();
    expect(result).toHaveLength(len);
    if (first) expect(result[0].ticker).toBe(first);
  });
});

describe('getUniverseStats', () => {
  it('应从 PostgreSQL 推导宇宙统计', async () => {
    marketStatsMocks.scanMarketStatsFromDb.mockResolvedValue(DB_STATS);
    const result = await getUniverseStats();
    expect(result.total).toBe(100);
    expect(result.updated_at).toBe('2024-01-01T00:00:00Z');
    expect(result.stats.us).toBe(60);
    expect(result.stats.cn).toBe(40);
  });

  it('stats 不存在时应返回零值', async () => {
    marketStatsMocks.scanMarketStatsFromDb.mockResolvedValue(null);
    const result = await getUniverseStats();
    expect(result.total).toBe(0);
    expect(result.updated_at).toBe('');
    expect(result.stats).toEqual({});
  });
});

describe('resolveUniverseFromCacheStats', () => {
  it('无 stats 时应返回零值', () => {
    expect(resolveUniverseFromCacheStats(null)).toEqual({ total: 0, updated_at: '', stats: {} });
  });
});

describe('scanTickersStats', () => {
  it.each([
    ['应返回 PostgreSQL 统计数据', DB_STATS],
    ['PostgreSQL 不可用时返回 null', null],
  ])('%s', async (_n, dbResult) => {
    marketStatsMocks.scanMarketStatsFromDb.mockResolvedValue(dbResult as never);
    const result = await scanTickersStats();
    if (dbResult) expect(result).toEqual(dbResult);
    else expect(result).toBeNull();
    if (dbResult === null) expect(await scanTickersStats(true)).toBeNull();
  });
});

describe('cpiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    macroDbMocks.loadCpiSeriesFromDb.mockResolvedValue([]);
    goMocks.callGoDataService.mockResolvedValue(JSON.stringify({ success: false, data: null }));
  });

  describe('fetchCpiForRoute - 三级降级', () => {
    it('Go 服务可用时返回 Go 原始数据，不标记降级', async () => {
      const goData = [{ date: '2020-01-01', value: 258.8 }];
      goMocks.callGoDataService.mockResolvedValueOnce(
        JSON.stringify({ success: true, data: goData }),
      );

      const result = await fetchCpiForRoute('us');

      expect(result).toEqual({ data: goData, degraded: false, notFound: false });
      expect(macroDbMocks.loadCpiSeriesFromDb).not.toHaveBeenCalled();
    });

    it('Go 不可用 + PG 有数据 → degraded=true 并附带降级提示', async () => {
      const pgData = [{ date: '2020-01-01', value: 258.8 }];
      macroDbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce(pgData);

      const result = await fetchCpiForRoute('cn');

      expect(result.degraded).toBe(true);
      expect(result.notFound).toBe(false);
      expect(result.data).toEqual(pgData);
      expect(result.degradedWarning).toContain('PostgreSQL');
    });

    it('Go 不可用 + PG 空 → notFound=true', async () => {
      const result = await fetchCpiForRoute('uk');

      expect(result).toEqual({ data: null, degraded: false, notFound: true });
    });

    it('Go 不可用 + 缓存命中（同一 country 第二次调用）→ degraded=true 返回缓存', async () => {
      // 第一次：Go 失败 + PG 成功 → 写入 routeData 缓存
      const pgData = [{ date: '2020-01-01', value: 258.8 }];
      macroDbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce(pgData);
      const first = await fetchCpiForRoute('de');
      expect(first.degraded).toBe(true);

      // 第二次：Go 仍失败，PG 不应被再次调用（命中缓存）
      const second = await fetchCpiForRoute('de');

      expect(second.degraded).toBe(true);
      expect(second.notFound).toBe(false);
      expect(second.data).toEqual(pgData);
      // PG 仅在第一次调用
      expect(macroDbMocks.loadCpiSeriesFromDb).toHaveBeenCalledTimes(1);
    });

    it('Go 返回 success=false 时视为不可用，降级到 PG', async () => {
      macroDbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([{ date: '2020-01', value: 1 }]);

      const result = await fetchCpiForRoute('fr');

      expect(result.degraded).toBe(true);
    });

    it('Go 服务抛异常时捕获并降级到 PG', async () => {
      goMocks.callGoDataService.mockRejectedValueOnce(new Error('go boom'));
      macroDbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([{ date: '2020-01', value: 1 }]);

      const result = await fetchCpiForRoute('ca');

      expect(result.degraded).toBe(true);
      expect(loggerMocks.warn).toHaveBeenCalled();
    });
  });

  describe('loadCpiMap - PG 主路径 + Go fallback + 缓存', () => {
    it('PG 主路径有数据 → 返回 { date: value } 映射', async () => {
      macroDbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([
        { date: '2020-01-01', value: 258.8 },
        { date: '2020-02-01', value: 259.1 },
      ]);

      const map = await loadCpiMap('JP');

      expect(map).toEqual({
        '2020-01-01': 258.8,
        '2020-02-01': 259.1,
      });
      // PG 收到小写 country
      expect(macroDbMocks.loadCpiSeriesFromDb).toHaveBeenCalledWith('jp');
      // Go fallback 不应被调用
      expect(goMocks.callGoDataService).not.toHaveBeenCalled();
    });

    it('缓存命中：同一 country 第二次调用不再访问 PG', async () => {
      macroDbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([{ date: '2020-01-01', value: 1 }]);

      await loadCpiMap('BR');
      const second = await loadCpiMap('BR');

      expect(second).toEqual({ '2020-01-01': 1 });
      expect(macroDbMocks.loadCpiSeriesFromDb).toHaveBeenCalledTimes(1);
    });

    it('PG 空 + Go fallback 有数据 → 扁平化为 { date: value }，date 取 slice(0,10)', async () => {
      macroDbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([]);
      goMocks.callGoDataService.mockResolvedValueOnce(
        JSON.stringify({
          success: true,
          data: [
            { date: '2020-01-01T00:00:00Z', value: 258.8 },
            { date: '2020-02-01T12:34:56Z', value: 259.1 },
          ],
        }),
      );

      const map = await loadCpiMap('AU');

      // date 应被 slice(0, 10) 截断为 YYYY-MM-DD
      expect(map).toEqual({
        '2020-01-01': 258.8,
        '2020-02-01': 259.1,
      });
    });

    it('PG 空 + Go fallback 也空 → 返回空对象且不写缓存', async () => {
      macroDbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([]);
      goMocks.callGoDataService.mockResolvedValueOnce(JSON.stringify({ success: true, data: [] }));

      const map = await loadCpiMap('KR');

      expect(map).toEqual({});
      // 再次调用相同 country，PG 仍应被调用（说明未缓存空结果）
      macroDbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([]);
      goMocks.callGoDataService.mockResolvedValueOnce(JSON.stringify({ success: true, data: [] }));
      await loadCpiMap('KR');
      expect(macroDbMocks.loadCpiSeriesFromDb).toHaveBeenCalledTimes(2);
    });
  });
});
