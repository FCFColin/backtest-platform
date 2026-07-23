import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';
import { createMockPool } from '../../helpers/dbMocks.js';

const dbMocks = vi.hoisted(() => ({
  getReadPool: vi.fn(),
}));

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

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getReadPool: dbMocks.getReadPool,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import {
  bytesToMb,
  getMarketDataStorageBytes,
  scanMarketStatsFromDb,
  getDbEngineStatus,
  inferMarket,
  deriveExchangeFromTicker,
} from '../../../packages/backend/src/db/marketStats.js';

describe('bytesToMb', () => {
  it('should convert bytes to MB with 1 decimal place', () => {
    expect(bytesToMb(0)).toBe(0);
    expect(bytesToMb(1048576)).toBe(1.0);
    expect(bytesToMb(1572864)).toBe(1.5);
    expect(bytesToMb(10485760)).toBe(10.0);
  });
});

describe('getMarketDataStorageBytes', () => {
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    dbMocks.getReadPool.mockReturnValue(mockPool);
  });

  it('should query pg_class and return total bytes', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ total_bytes: '5242880' }],
    });
    const result = await getMarketDataStorageBytes();
    expect(result).toBe(5242880);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('pg_total_relation_size'), [
      ['tickers', 'prices', 'cpi_data', 'exchange_rates'],
    ]);
  });

  it('should return 0 on DB error and log warn', async () => {
    mockPool.query.mockRejectedValue(new Error('fail'));
    const result = await getMarketDataStorageBytes();
    expect(result).toBe(0);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining('表空间'),
    );
  });
});

describe('scanMarketStatsFromDb', () => {
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    dbMocks.getReadPool.mockReturnValue(mockPool);
  });

  it('should aggregate ticker/prices data into DbMarketStats', async () => {
    const mockRows = [
      {
        ticker: 'AAPL',
        market: 'US',
        category: 'STOCK',
        n_points: 5000,
        first_date: '2014-01-01',
        last_date: '2024-06-01',
      },
      {
        ticker: 'SPY',
        market: 'US',
        category: 'ETF',
        n_points: 7000,
        first_date: '2009-01-01',
        last_date: '2024-06-01',
      },
      {
        ticker: 'SPX',
        market: '',
        category: 'INDEX',
        n_points: 10000,
        first_date: '1990-01-01',
        last_date: '2024-06-01',
      },
    ];
    mockPool.query
      .mockResolvedValueOnce({ rows: mockRows })
      .mockResolvedValueOnce({ rows: [{ total_bytes: '2097152' }] });

    const result = await scanMarketStatsFromDb();
    expect(result).not.toBeNull();

    expect(result!.total_cached).toBe(3);

    expect(result!.by_market).toEqual({
      US: { count: 3, stocks: 1, etfs: 1, indices: 1 },
    });

    expect(result!.by_type).toEqual({ STOCK: 1, ETF: 1, INDEX: 1 });

    expect(result!.date_ranges).toEqual({
      earliest: '1990-01-01',
      latest: '2024-06-01',
    });

    expect(result!.coverage).toEqual({
      tickers_with_5y_plus: 3,
      tickers_with_10y_plus: 3,
      tickers_with_20y_plus: 1,
      avg_data_points: Math.round((5000 + 7000 + 10000) / 3),
      median_data_points: 7000,
    });

    expect(result!.data_quality.with_adj_close).toBe(3);
    expect(result!.data_quality.with_dividends).toBe(0);
    expect(result!.data_quality.with_splits).toBe(0);
    expect(result!.data_quality.total_data_points).toBe(5000 + 7000 + 10000);
    expect(result!.data_quality.total_size_mb).toBe(2.0);

    expect(result!.sample_tickers.us_stock).toHaveLength(1);
    expect(result!.sample_tickers.us_stock[0].ticker).toBe('AAPL');
    expect(result!.sample_tickers.us_etf).toHaveLength(1);
    expect(result!.sample_tickers.us_etf[0].ticker).toBe('SPY');
    expect(result!.sample_tickers.index).toHaveLength(1);
    expect(result!.sample_tickers.index[0].ticker).toBe('SPX');
    expect(result!.sample_tickers.cn_stock).toHaveLength(0);
    expect(result!.sample_tickers.cn_etf).toHaveLength(0);

    expect(result!.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // 修复后：mock 行无 exchange 字段，由 deriveExchangeFromTicker 兜底推导为 US（Task 4.3）
    expect(result!.by_exchange).toEqual({ US: 3 });
    expect(Object.keys(result!.by_decade).length).toBeGreaterThan(0);
    expect(Object.keys(result!.by_year_count).length).toBeGreaterThan(0);
  });

  it('should handle CN market tickers', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            ticker: '000001.SZ',
            market: 'CN',
            category: 'STOCK',
            n_points: 3000,
            first_date: '2015-01-01',
            last_date: '2024-06-01',
          },
          {
            ticker: '510050.SS',
            market: 'CN',
            category: 'ETF',
            n_points: 2000,
            first_date: '2018-01-01',
            last_date: '2024-06-01',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_bytes: '0' }] });

    const result = await scanMarketStatsFromDb();
    expect(result).not.toBeNull();
    expect(result!.by_market).toHaveProperty('CN');
    expect(result!.by_market.CN).toEqual({ count: 2, stocks: 1, etfs: 1, indices: 0 });
    expect(result!.sample_tickers.cn_stock).toHaveLength(1);
    expect(result!.sample_tickers.cn_stock[0].ticker).toBe('000001.SZ');
    expect(result!.sample_tickers.cn_etf).toHaveLength(1);
    expect(result!.sample_tickers.cn_etf[0].ticker).toBe('510050.SS');
    // 修复后：A 股按后缀推导为 SZSE / SSE（Task 4.3 + 5.1）
    expect(result!.by_exchange).toEqual({ SZSE: 1, SSE: 1 });
  });

  it('should prefer DB exchange column over ticker-suffix fallback', async () => {
    // DB 显式提供 exchange 列时，优先使用 DB 值（如 NASDAQ 细化），不回退到后缀推导
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            ticker: 'AAPL',
            market: 'US',
            category: 'STOCK',
            exchange: 'NASDAQ',
            n_points: 5000,
            first_date: '2014-01-01',
            last_date: '2024-06-01',
          },
          {
            ticker: 'SPY',
            market: 'US',
            category: 'ETF',
            exchange: 'NYSE',
            n_points: 7000,
            first_date: '2009-01-01',
            last_date: '2024-06-01',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_bytes: '0' }] });

    const result = await scanMarketStatsFromDb();
    expect(result!.by_exchange).toEqual({ NASDAQ: 1, NYSE: 1 });
  });

  it('should limit sample_tickers to 5 per category', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      ticker: `T${i}`,
      market: 'US',
      category: 'STOCK',
      n_points: 100 + i,
      first_date: '2020-01-01',
      last_date: '2024-06-01',
    }));
    mockPool.query
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [{ total_bytes: '0' }] });

    const result = await scanMarketStatsFromDb();
    expect(result!.sample_tickers.us_stock).toHaveLength(5);
  });

  it('should return null for empty rows', async () => {
    const result = await scanMarketStatsFromDb();
    expect(result).toBeNull();
  });

  it('should return null on DB error and log warn', async () => {
    mockPool.query.mockRejectedValue(new Error('fail'));
    const result = await scanMarketStatsFromDb();
    expect(result).toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining('统计聚合'),
    );
  });
});

describe('getDbEngineStatus', () => {
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    dbMocks.getReadPool.mockReturnValue(mockPool);
  });

  it('should parse total/with_prices/last_update from DB', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ total: '15000', with_prices: '12000', last_update: new Date('2024-06-01') }],
    });
    const result = await getDbEngineStatus();
    expect(result).toEqual({
      totalTickers: 15000,
      cachedTickers: 12000,
      lastUpdate: '2024-06-01T00:00:00.000Z',
    });
  });

  it('should return zeros on DB error', async () => {
    mockPool.query.mockRejectedValue(new Error('fail'));
    const result = await getDbEngineStatus();
    expect(result).toEqual({ totalTickers: 0, cachedTickers: 0, lastUpdate: null });
  });

  it('should return null lastUpdate when row has null', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ total: '100', with_prices: '50', last_update: null }],
    });
    const result = await getDbEngineStatus();
    expect(result.lastUpdate).toBeNull();
    expect(result.totalTickers).toBe(100);
    expect(result.cachedTickers).toBe(50);
  });
});

describe('inferMarket', () => {
  // Task 5.1: 正则修复 /[._](SZ|SS|SH)$/i 同时支持点号与下划线后缀
  it('should detect CN market for underscore-suffix tickers', () => {
    expect(inferMarket('000001_SZ', '')).toBe('CN');
    expect(inferMarket('600000_SS', '')).toBe('CN');
    expect(inferMarket('600519_SH', '')).toBe('CN');
  });

  it('should detect CN market for dot-suffix tickers', () => {
    expect(inferMarket('000001.SZ', '')).toBe('CN');
    expect(inferMarket('600000.SH', '')).toBe('CN');
    expect(inferMarket('510050.SS', '')).toBe('CN');
  });

  it('should detect US market for tickers without CN suffix', () => {
    expect(inferMarket('AAPL', '')).toBe('US');
    expect(inferMarket('SPY', '')).toBe('US');
    expect(inferMarket('VTI', '')).toBe('US');
  });

  it('should uppercase explicit market field', () => {
    expect(inferMarket('AAPL', 'us')).toBe('US');
    expect(inferMarket('000001_SZ', 'cn')).toBe('CN');
  });

  it('should prefer explicit market field over ticker-suffix inference', () => {
    // 即使 ticker 带 _SZ 后缀，显式 market 字段优先
    expect(inferMarket('000001_SZ', 'CN')).toBe('CN');
    expect(inferMarket('000001_SZ', 'US')).toBe('US');
  });

  it('should be case-insensitive for ticker suffix', () => {
    expect(inferMarket('000001_sz', '')).toBe('CN');
    expect(inferMarket('600519.sh', '')).toBe('CN');
  });
});

describe('deriveExchangeFromTicker', () => {
  // Task 4.3: 按 ticker 后缀推导交易所代码（与 Go provider.DeriveExchange 一致）
  it('should derive SZSE for Shenzhen tickers (_SZ / .SZ)', () => {
    expect(deriveExchangeFromTicker('000001_SZ')).toBe('SZSE');
    expect(deriveExchangeFromTicker('000001.SZ')).toBe('SZSE');
  });

  it('should derive SSE for Shanghai tickers (_SS / .SS / _SH / .SH)', () => {
    expect(deriveExchangeFromTicker('510050_SS')).toBe('SSE');
    expect(deriveExchangeFromTicker('510050.SS')).toBe('SSE');
    expect(deriveExchangeFromTicker('600519_SH')).toBe('SSE');
    expect(deriveExchangeFromTicker('600519.SH')).toBe('SSE');
  });

  it('should derive US for tickers without CN suffix', () => {
    expect(deriveExchangeFromTicker('AAPL')).toBe('US');
    expect(deriveExchangeFromTicker('SPY')).toBe('US');
    expect(deriveExchangeFromTicker('VTI')).toBe('US');
  });

  it('should be case-insensitive', () => {
    expect(deriveExchangeFromTicker('000001_sz')).toBe('SZSE');
    expect(deriveExchangeFromTicker('600519.sh')).toBe('SSE');
  });

  it('should not match non-exchange dot suffixes', () => {
    // BRK.B（伯克希尔 B 股）的 .B 不是交易所后缀
    expect(deriveExchangeFromTicker('BRK.B')).toBe('US');
  });
});
