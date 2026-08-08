import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPool } from '../../helpers/mockFactories.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';

const dbMocks = vi.hoisted(() => ({
  getReadPool: vi.fn(),
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getReadPool: dbMocks.getReadPool,
}));

type MacroDataModule = typeof import('../../../packages/backend/src/db/macroData.js');

describe('loadCpiSeriesFromDb', () => {
  let macroData: MacroDataModule;
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPool = createMockPool();
    dbMocks.getReadPool.mockReturnValue(mockPool);
    macroData = await import('../../../packages/backend/src/db/macroData.js');
  });

  it('should load CPI series for US from postgres', async () => {
    mockPool.query.mockResolvedValue({
      rows: [
        { date: new Date('2024-01-01'), value: 300.5 },
        { date: new Date('2024-02-01'), value: 301.0 },
      ],
    });
    const result = await macroData.loadCpiSeriesFromDb('us');
    expect(result).toEqual([
      { date: '2024-01-01', value: 300.5 },
      { date: '2024-02-01', value: 301.0 },
    ]);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('cpi_data'), ['US']);
  });

  it('should map country cn to CN in SQL param', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ date: new Date('2024-01-01'), value: 100 }],
    });
    await macroData.loadCpiSeriesFromDb('cn');
    expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['CN']);
  });

  it('should return empty array on DB error and log warn', async () => {
    const err = new Error('connection failed');
    mockPool.query.mockRejectedValue(err);
    const result = await macroData.loadCpiSeriesFromDb('us');
    expect(result).toEqual([]);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      expect.stringContaining('CPI'),
    );
  });
});

describe('loadExchangeRatesFromDb', () => {
  let macroData: MacroDataModule;
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPool = createMockPool();
    dbMocks.getReadPool.mockReturnValue(mockPool);
    macroData = await import('../../../packages/backend/src/db/macroData.js');
  });

  it('should build date->rate map with default USD/CNY', async () => {
    mockPool.query.mockResolvedValue({
      rows: [
        { date: new Date('2024-01-01'), rate: 7.12 },
        { date: new Date('2024-01-02'), rate: 7.15 },
      ],
    });
    const result = await macroData.loadExchangeRatesFromDb();
    expect(result).toEqual({ '2024-01-01': 7.12, '2024-01-02': 7.15 });
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('exchange_rates'), [
      'USD',
      'CNY',
    ]);
  });

  it('should return cached map on second call', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ date: new Date('2024-01-01'), rate: 7.12 }],
    });
    await macroData.loadExchangeRatesFromDb();
    const result = await macroData.loadExchangeRatesFromDb();
    expect(result).toEqual({ '2024-01-01': 7.12 });
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('should accept custom base/target currency', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ date: new Date('2024-01-01'), rate: 0.85 }],
    });
    const result = await macroData.loadExchangeRatesFromDb('EUR', 'GBP');
    expect(result).toEqual({ '2024-01-01': 0.85 });
    expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['EUR', 'GBP']);
  });

  it('should return empty object on DB error', async () => {
    mockPool.query.mockRejectedValue(new Error('timeout'));
    const result = await macroData.loadExchangeRatesFromDb();
    expect(result).toEqual({});
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
});
