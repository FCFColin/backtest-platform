import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPool } from '../../helpers/mockFactories.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';

const dbMocks = vi.hoisted(() => ({ getReadPool: vi.fn() }));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({ getReadPool: dbMocks.getReadPool }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

import {
  bytesToMb,
  getMarketDataStorageBytes,
  scanMarketStatsFromDb,
  getDbEngineStatus,
  inferMarket,
  deriveExchangeFromTicker,
  __clearCachesForTests,
} from '../../../packages/backend/src/db/marketStats.js';

let mockPool: ReturnType<typeof createMockPool>;
beforeEach(() => {
  vi.clearAllMocks();
  __clearCachesForTests();
  mockPool = createMockPool();
  dbMocks.getReadPool.mockReturnValue(mockPool);
});

describe('bytesToMb', () => {
  it.each([
    [0, 0],
    [1048576, 1.0],
    [1572864, 1.5],
    [10485760, 10.0],
  ])('should convert %s bytes to %s MB', (bytes, mb) => {
    expect(bytesToMb(bytes)).toBe(mb);
  });
});

describe('getMarketDataStorageBytes', () => {
  it('should query pg_class and return total bytes', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ total_bytes: '5242880' }] });
    expect(await getMarketDataStorageBytes()).toBe(5242880);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('pg_total_relation_size'), [
      ['tickers', 'prices', 'cpi_data', 'exchange_rates'],
    ]);
  });
  it('should return 0 on DB error and log warn', async () => {
    mockPool.query.mockRejectedValue(new Error('fail'));
    expect(await getMarketDataStorageBytes()).toBe(0);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining('表空间'),
    );
  });
});

function mockTickerRow(overrides: Record<string, unknown> = {}) {
  return {
    ticker: 'AAPL',
    market: 'US',
    category: 'STOCK',
    n_points: 5000,
    first_date: '2014-01-01',
    last_date: '2024-06-01',
    ...overrides,
  };
}

describe('scanMarketStatsFromDb', () => {
  it('should aggregate ticker/prices data into DbMarketStats', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          mockTickerRow({
            ticker: 'AAPL',
            market: 'US',
            category: 'STOCK',
            n_points: 5000,
            first_date: '2014-01-01',
          }),
          mockTickerRow({
            ticker: 'SPY',
            market: 'US',
            category: 'ETF',
            n_points: 7000,
            first_date: '2009-01-01',
          }),
          mockTickerRow({
            ticker: 'SPX',
            market: '',
            category: 'INDEX',
            n_points: 10000,
            first_date: '1990-01-01',
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_bytes: '2097152' }] });
    const r = await scanMarketStatsFromDb();
    expect(r).not.toBeNull();
    expect(r!.total_cached).toBe(3);
    expect(r!.by_market).toEqual({ US: { count: 3, stocks: 1, etfs: 1, indices: 1 } });
    expect(r!.by_type).toEqual({ STOCK: 1, ETF: 1, INDEX: 1 });
    expect(r!.date_ranges).toEqual({ earliest: '1990-01-01', latest: '2024-06-01' });
    expect(r!.coverage).toEqual({
      tickers_with_5y_plus: 3,
      tickers_with_10y_plus: 3,
      tickers_with_20y_plus: 1,
      avg_data_points: Math.round((5000 + 7000 + 10000) / 3),
      median_data_points: 7000,
    });
    expect(r!.data_quality).toMatchObject({
      with_adj_close: 3,
      with_dividends: 0,
      with_splits: 0,
      total_data_points: 22000,
      total_size_mb: 2.0,
    });
    expect(r!.sample_tickers.us_stock[0].ticker).toBe('AAPL');
    expect(r!.sample_tickers.us_etf[0].ticker).toBe('SPY');
    expect(r!.sample_tickers.index[0].ticker).toBe('SPX');
    expect(r!.sample_tickers.cn_stock).toHaveLength(0);
    expect(r!.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r!.by_exchange).toEqual({ US: 3 });
    expect(Object.keys(r!.by_decade).length).toBeGreaterThan(0);
  });
  it('should handle CN market tickers', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          mockTickerRow({
            ticker: '000001.SZ',
            market: 'CN',
            category: 'STOCK',
            n_points: 3000,
            first_date: '2015-01-01',
          }),
          mockTickerRow({
            ticker: '510050.SS',
            market: 'CN',
            category: 'ETF',
            n_points: 2000,
            first_date: '2018-01-01',
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_bytes: '0' }] });
    const r = await scanMarketStatsFromDb();
    expect(r!.by_market.CN).toEqual({ count: 2, stocks: 1, etfs: 1, indices: 0 });
    expect(r!.sample_tickers.cn_stock[0].ticker).toBe('000001.SZ');
    expect(r!.sample_tickers.cn_etf[0].ticker).toBe('510050.SS');
    expect(r!.by_exchange).toEqual({ SZSE: 1, SSE: 1 });
  });
  it('should prefer DB exchange column over ticker-suffix fallback', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          mockTickerRow({ ticker: 'AAPL', exchange: 'NASDAQ' }),
          mockTickerRow({ ticker: 'SPY', category: 'ETF', exchange: 'NYSE' }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_bytes: '0' }] });
    expect((await scanMarketStatsFromDb())!.by_exchange).toEqual({ NASDAQ: 1, NYSE: 1 });
  });
  it('should limit sample_tickers to 5 per category', async () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      mockTickerRow({ ticker: `T${i}`, n_points: 100 + i }),
    );
    mockPool.query
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [{ total_bytes: '0' }] });
    expect((await scanMarketStatsFromDb())!.sample_tickers.us_stock).toHaveLength(5);
  });
  it('should return null for empty rows', async () => {
    expect(await scanMarketStatsFromDb()).toBeNull();
  });
  it('should return null on DB error and log warn', async () => {
    mockPool.query.mockRejectedValue(new Error('fail'));
    expect(await scanMarketStatsFromDb()).toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining('统计聚合'),
    );
  });
});

describe('getDbEngineStatus', () => {
  it('should parse total/with_prices/last_update from DB', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ total: '15000', with_prices: '12000', last_update: new Date('2024-06-01') }],
    });
    expect(await getDbEngineStatus()).toEqual({
      totalTickers: 15000,
      cachedTickers: 12000,
      lastUpdate: '2024-06-01T00:00:00.000Z',
    });
  });
  it('should return zeros on DB error', async () => {
    mockPool.query.mockRejectedValue(new Error('fail'));
    expect(await getDbEngineStatus()).toEqual({
      totalTickers: 0,
      cachedTickers: 0,
      lastUpdate: null,
    });
  });
  it('should return null lastUpdate when row has null', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ total: '100', with_prices: '50', last_update: null }],
    });
    expect(await getDbEngineStatus()).toEqual({
      totalTickers: 100,
      cachedTickers: 50,
      lastUpdate: null,
    });
  });
});

describe('inferMarket', () => {
  it.each([
    ['000001_SZ', 'CN'],
    ['600000_SS', 'CN'],
    ['600519_SH', 'CN'],
    ['000001.SZ', 'CN'],
    ['600000.SH', 'CN'],
    ['510050.SS', 'CN'],
    ['000001_sz', 'CN'],
    ['600519.sh', 'CN'],
    ['AAPL', 'US'],
    ['SPY', 'US'],
    ['VTI', 'US'],
  ])('inferMarket(%s) should be %s', (ticker, expected) => {
    expect(inferMarket(ticker, '')).toBe(expected);
  });
  it('should uppercase explicit market field', () => {
    expect(inferMarket('AAPL', 'us')).toBe('US');
    expect(inferMarket('000001_SZ', 'cn')).toBe('CN');
  });
  it('should prefer explicit market field over ticker-suffix inference', () => {
    expect(inferMarket('000001_SZ', 'US')).toBe('US');
  });
});

describe('deriveExchangeFromTicker', () => {
  it.each([
    ['000001_SZ', 'SZSE'],
    ['000001.SZ', 'SZSE'],
    ['510050_SS', 'SSE'],
    ['510050.SS', 'SSE'],
    ['600519_SH', 'SSE'],
    ['600519.SH', 'SSE'],
    ['000001_sz', 'SZSE'],
    ['600519.sh', 'SSE'],
    ['AAPL', 'US'],
    ['SPY', 'US'],
    ['VTI', 'US'],
    ['BRK.B', 'US'],
  ])('deriveExchangeFromTicker(%s) should be %s', (ticker, expected) => {
    expect(deriveExchangeFromTicker(ticker)).toBe(expected);
  });
});
