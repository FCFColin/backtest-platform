import { describe, it, expect, vi, beforeEach } from 'vitest';

import { mockLogger } from '../../helpers/mockFactories.js';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const mocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
  sanitizeLog: vi.fn((v: string) => v),
  runGridSearch: vi.fn(),
}));

vi.mock('../../../packages/backend/src/services/dataService.js', () => ({
  fetchHistoryData: mocks.fetchHistoryData,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/utils/logSanitizer.js', () => ({
  sanitizeLog: mocks.sanitizeLog,
}));

vi.mock('../../../packages/backend/src/engine/tacticalGrid.js', () => ({
  runGridSearch: mocks.runGridSearch,
}));

import {
  executeGridSearch,
  MAX_GRID_COMBINATIONS,
} from '../../../packages/backend/src/application/grid-application-service.js';

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    indicator: 'sma',
    param1: { min: 10, max: 50, step: 10 },
    param2: { min: 5, max: 20, step: 5 },
    tickers: ['SPY'],
    startDate: '2020-01-01',
    endDate: '2020-12-31',
    objective: 'maxCagr',
    ...overrides,
  };
}

describe('executeGridSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when indicator/param1/param2 missing', async () => {
    const result = await executeGridSearch({
      tickers: ['SPY'],
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('缺少必要参数: indicator, param1, param2');
  });

  it('returns error when tickers is empty', async () => {
    const result = await executeGridSearch(validBody({ tickers: [] }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('请至少输入一个标的代码');
  });

  it('returns error when startDate or endDate missing', async () => {
    const result = await executeGridSearch(validBody({ startDate: undefined }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('缺少起止日期');
  });

  it('returns error when total combinations exceed limit', async () => {
    const body = validBody({
      param1: { min: 1, max: 15, step: 1 },
      param2: { min: 1, max: 15, step: 1 },
    });
    const result = await executeGridSearch(body);
    expect(result.success).toBe(false);
    expect(result.error).toContain('参数组合过多');
    expect(result.error).toContain(String(MAX_GRID_COMBINATIONS));
  });

  it('returns error when price data not found', async () => {
    mocks.fetchHistoryData.mockResolvedValueOnce({ SPY: {} });
    const result = await executeGridSearch(validBody());
    expect(result.success).toBe(false);
    expect(result.error).toBe('未找到 SPY 的价格数据');
  });

  it('returns error when trading days are fewer than 10', async () => {
    mocks.fetchHistoryData.mockResolvedValueOnce({
      SPY: { '2020-01-01': 100, '2020-01-02': 101, '2020-01-03': 102 },
    });
    const result = await executeGridSearch(validBody());
    expect(result.success).toBe(false);
    expect(result.error).toBe('有效交易日不足，无法运行网格搜索');
  });

  it('returns success on valid grid search', async () => {
    const prices: Record<string, number> = {};
    for (let d = 1; d <= 15; d++) {
      prices[`2020-01-${String(d).padStart(2, '0')}`] = 100 + d;
    }
    mocks.fetchHistoryData.mockResolvedValueOnce({ SPY: prices });
    mocks.runGridSearch.mockReturnValueOnce({ result: 'ok', combinations: 20 });

    const result = await executeGridSearch(validBody());
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect((result.data as Record<string, unknown>).result).toBe('ok');
    expect(loggerMocks.info).toHaveBeenCalled();
  });
});
