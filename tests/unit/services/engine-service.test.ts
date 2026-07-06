/**
 * EngineService 单元测试
 *
 * 行情读取与统计均来自 PostgreSQL；stats 缓存文件仅加速展示。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

// ===== vi.hoisted =====
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

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

const fsPromisesMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn(),
}));

// ===== Mock 模块 =====

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/utils/tickerValidation.js', () => ({
  isValidTicker: tickerValidationMocks.isValidTicker,
}));

vi.mock('../../../packages/backend/src/db/index.js', () => ({
  getReadPool: () => ({ query: pgMocks.query }),
}));

vi.mock('../../../packages/backend/src/db/marketStats.js', () => ({
  scanMarketStatsFromDb: marketStatsMocks.scanMarketStatsFromDb,
  getDbEngineStatus: marketStatsMocks.getDbEngineStatus,
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
  searchTickers,
  loadTickerData,
  getUniverseStats,
  scanTickersStats,
  scanTickersStatsAsync,
  resolveUniverseFromCacheStats,
} from '../../../packages/backend/src/services/engineService.js';

describe('getEngineStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stats 缓存不存在时应返回零值状态', async () => {
    marketStatsMocks.getDbEngineStatus.mockRejectedValue(new Error('db down'));

    const status = await getEngineStatus();

    expect(status.totalTickers).toBe(0);
    expect(status.cachedTickers).toBe(0);
    expect(status.lastUpdate).toBeNull();
    expect(status.progress).toBeNull();
    expect(status.universeAge).toBeNull();
  });

  it('应从 PostgreSQL 获取引擎状态', async () => {
    marketStatsMocks.getDbEngineStatus.mockResolvedValue({
      totalTickers: 42,
      cachedTickers: 42,
      lastUpdate: '2024-06-01T00:00:00Z',
    });

    const status = await getEngineStatus();

    expect(status.cachedTickers).toBe(42);
    expect(status.totalTickers).toBe(42);
    expect(status.lastUpdate).toBe('2024-06-01T00:00:00Z');
    expect(status.progress).toBeNull();
  });
});

describe('loadTickerData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('合法 ticker 应从 PostgreSQL 读取', async () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(true);
    pgMocks.query.mockResolvedValue({
      rows: [
        {
          date: new Date('2024-01-02'),
          open: 1,
          high: 2,
          low: 1,
          close: 185.5,
          volume: 100,
          adjusted_close: 185.5,
        },
      ],
    });

    const result = await loadTickerData('AAPL');

    expect(result?.meta).toEqual({ ticker: 'AAPL' });
    expect((result?.prices as Array<{ close: number }>)[0].close).toBe(185.5);
  });

  it('非法 ticker 应返回 null（路径遍历防护）', async () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(false);

    const result = await loadTickerData('../../../etc/passwd');

    expect(result).toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledWith(expect.stringContaining('拒绝非法 ticker'));
  });

  it('无数据时应返回 null', async () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(true);
    pgMocks.query.mockResolvedValue({ rows: [] });

    const result = await loadTickerData('UNKNOWN');

    expect(result).toBeNull();
  });
});

describe('getTickerList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应从 PostgreSQL 读取标的列表', async () => {
    pgMocks.query.mockResolvedValue({
      rows: [
        { ticker: 'AAPL', category: 'Apple', market: 'US' },
        { ticker: 'BND', category: 'ETF', market: 'US' },
      ],
    });

    const result = await getTickerList();

    expect(result).toHaveLength(2);
    expect(result[0].ticker).toBe('AAPL');
  });

  it('PostgreSQL 查询失败时应返回空数组', async () => {
    pgMocks.query.mockRejectedValue(new Error('db down'));

    const result = await getTickerList();

    expect(result).toEqual([]);
  });
});

describe('searchTickers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应根据 query 过滤标的（不区分大小写）', async () => {
    pgMocks.query.mockResolvedValue({
      rows: [
        { ticker: 'AAPL', category: 'Apple', market: 'US' },
        { ticker: 'BND', category: 'Vanguard Bond', market: 'US' },
        { ticker: 'SPY', category: 'S&P 500', market: 'US' },
      ],
    });

    const result = await searchTickers('bond');

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('BND');
  });

  it('应匹配 ticker/name/category/market 任一字段', async () => {
    pgMocks.query.mockResolvedValue({
      rows: [
        { ticker: 'AAPL', category: 'Apple', market: 'US' },
        { ticker: '600519.SH', category: '贵州茅台', market: 'CN' },
      ],
    });

    const result = await searchTickers('cn');

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('600519.SH');
  });

  it('结果应限制在 30 条以内', async () => {
    pgMocks.query.mockResolvedValue({
      rows: Array.from({ length: 50 }, (_, i) => ({
        ticker: `STOCK${i}`,
        category: `Stock ${i}`,
        market: 'US',
      })),
    });

    const result = await searchTickers('stock');

    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe('getUniverseStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应从 PostgreSQL 推导宇宙统计', async () => {
    marketStatsMocks.scanMarketStatsFromDb.mockResolvedValue({
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
    });

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应返回 PostgreSQL 统计数据', async () => {
    const dbResult = {
      generated_at: '2024-01-01T00:00:00Z',
      total_cached: 5,
      by_market: {},
      by_type: {},
      by_exchange: {},
      date_ranges: { earliest: null, latest: null },
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
    marketStatsMocks.scanMarketStatsFromDb.mockResolvedValue(dbResult);

    const result = await scanTickersStats();

    expect(result).toEqual(dbResult);
  });

  it('PostgreSQL 不可用时返回 null', async () => {
    marketStatsMocks.scanMarketStatsFromDb.mockResolvedValue(null);

    expect(await scanTickersStats()).toBeNull();
    expect(await scanTickersStats(true)).toBeNull();
  });
});

describe('scanTickersStatsAsync', () => {
  const dbStats = {
    generated_at: '2024-06-01T00:00:00Z',
    total_cached: 1,
    by_market: { US: { count: 1, stocks: 1, etfs: 0, indices: 0 } },
    by_type: { STOCK: 1 },
    by_exchange: { '': 1 },
    date_ranges: { earliest: '2014-01-02', latest: '2024-01-02' },
    by_decade: { '2010s': 1 },
    by_year_count: { '10-14年': 1 },
    coverage: {
      tickers_with_5y_plus: 1,
      tickers_with_10y_plus: 1,
      tickers_with_20y_plus: 0,
      avg_data_points: 500,
      median_data_points: 500,
    },
    data_quality: {
      with_adj_close: 1,
      with_dividends: 0,
      with_splits: 0,
      total_data_points: 500,
      total_size_mb: 0.1,
    },
    recent_updates: [],
    sample_tickers: {
      us_stock: [
        {
          ticker: 'AAPL',
          name: 'Apple',
          first_date: '2014-01-02',
          last_date: '2024-01-02',
          data_points: 500,
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fsMocks.existsSync.mockReturnValue(false);
    marketStatsMocks.scanMarketStatsFromDb.mockResolvedValue(dbStats);
  });

  it('应从 PostgreSQL 聚合统计', async () => {
    const result = await scanTickersStatsAsync(true);

    expect(result).not.toBeNull();
    expect(result!.total_cached).toBe(1);
    expect(result!.by_market.US.count).toBe(1);
    expect(marketStatsMocks.scanMarketStatsFromDb).toHaveBeenCalled();
  });

  it('PostgreSQL 不可用时应抛出错误', async () => {
    marketStatsMocks.scanMarketStatsFromDb.mockResolvedValue(null);

    await expect(scanTickersStatsAsync(true)).rejects.toThrow('数据库为空或连接失败');
  });

  it('应始终从 PostgreSQL 查询', async () => {
    const result = await scanTickersStatsAsync(false);

    expect(result.total_cached).toBe(1);
    expect(marketStatsMocks.scanMarketStatsFromDb).toHaveBeenCalled();
  });
});

describe('loadTickerData 路径遍历', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应拒绝含路径遍历的 ticker', async () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(false);

    expect(await loadTickerData('../../etc/passwd')).toBeNull();
    expect(await loadTickerData('..\\..\\windows\\system32')).toBeNull();
    expect(pgMocks.query).not.toHaveBeenCalled();
  });

  it('应拒绝空 ticker', async () => {
    tickerValidationMocks.isValidTicker.mockReturnValue(false);

    expect(await loadTickerData('')).toBeNull();
  });
});
