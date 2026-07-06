import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  runPortfolioBacktest: vi.fn(),
  fetchHistoryData: vi.fn(),
  numericRange: vi.fn(),
}));

vi.mock('../../../packages/backend/src/engine/portfolio.js', () => ({
  runPortfolioBacktest: mocks.runPortfolioBacktest,
}));

vi.mock('../../../packages/backend/src/services/dataService.js', () => ({
  fetchHistoryData: mocks.fetchHistoryData,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../packages/backend/src/utils/numericRange.js', () => ({
  numericRange: mocks.numericRange,
}));

import {
  executeOptimization,
  MAX_OPTIMIZER_COMBINATIONS,
} from '../../../packages/backend/src/application/optimizer-application-service.js';

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    portfolio: { name: 'test', assets: [{ ticker: 'AAPL', weight: 100 }] },
    parameterSpace: {
      rebalanceFrequencies: ['monthly', 'quarterly'],
      initialCapital: { min: 10000, max: 10000, step: 0 },
    },
    parameters: {
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    },
    objective: 'maxCagr',
    ...overrides,
  };
}

describe('executeOptimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when portfolio assets is missing', async () => {
    const result = await executeOptimization(validBody({ portfolio: { name: 'test' } }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('缺少组合配置：portfolio.assets');
  });

  it('returns error when no rebalance frequencies', async () => {
    const result = await executeOptimization(
      validBody({ parameterSpace: { initialCapital: { min: 10000, max: 10000, step: 0 } } }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('请至少选择一个再平衡频率');
  });

  it('returns error when startDate or endDate missing', async () => {
    const result = await executeOptimization(validBody({ parameters: { startDate: undefined } }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('缺少回测日期范围');
  });

  it('returns error when ticker data not found', async () => {
    mocks.fetchHistoryData.mockResolvedValueOnce({ AAPL: {} });
    const result = await executeOptimization(validBody());
    expect(result.success).toBe(false);
    expect(result.error).toBe('以下标的代码无效：AAPL');
  });

  it('returns error when parameter space is empty', async () => {
    mocks.numericRange.mockReturnValue([]);
    mocks.fetchHistoryData.mockResolvedValueOnce({ AAPL: { '2020-01-01': 100 } });
    const result = await executeOptimization(validBody());
    expect(result.success).toBe(false);
    expect(result.error).toBe('参数空间为空，请检查范围与步长');
  });

  it('returns error when too many combinations', async () => {
    const capitals = Array.from({ length: MAX_OPTIMIZER_COMBINATIONS + 1 }, (_, i) => 10000 + i);
    mocks.numericRange.mockReturnValue(capitals);
    mocks.fetchHistoryData.mockResolvedValueOnce({ AAPL: { '2020-01-01': 100 } });
    const result = await executeOptimization(validBody());
    expect(result.success).toBe(false);
    expect(result.error).toContain('超过上限');
    expect(result.error).toContain(String(MAX_OPTIMIZER_COMBINATIONS));
  });

  it('returns success on valid optimization', async () => {
    mocks.numericRange.mockReturnValue([10000]);
    mocks.fetchHistoryData.mockResolvedValueOnce({ AAPL: { '2020-01-01': 100 } });
    mocks.runPortfolioBacktest
      .mockReturnValueOnce({
        portfolios: [
          {
            statistics: {
              cagr: 0.12,
              maxDrawdown: 0.15,
              sharpe: 1.5,
              sortino: 1.8,
              stdev: 0.2,
              calmar: 0.8,
            },
          },
          {
            statistics: {
              cagr: 0.1,
              maxDrawdown: 0.2,
              sharpe: 1.2,
              sortino: 1.4,
              stdev: 0.25,
              calmar: 0.5,
            },
          },
        ],
      })
      .mockReturnValueOnce({
        portfolios: [{ growthCurve: [{ date: '2020-01-01', value: 10000 }] }],
      });

    const result = await executeOptimization(validBody());
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.results)).toBe(true);
    expect((data.results as unknown[]).length).toBe(2);
    expect(data.best).toBeDefined();
    expect((data.best as Record<string, unknown>).cagr).toBe(0.12);
    expect(mocks.runPortfolioBacktest).toHaveBeenCalledTimes(2);
  });

  it('returns success with constraints filtering', async () => {
    mocks.numericRange.mockReturnValue([10000]);
    mocks.fetchHistoryData.mockResolvedValueOnce({ AAPL: { '2020-01-01': 100 } });
    mocks.runPortfolioBacktest
      .mockReturnValueOnce({
        portfolios: [
          {
            statistics: {
              cagr: 0.12,
              maxDrawdown: 0.1,
              sharpe: 1.5,
              sortino: 1.8,
              stdev: 0.2,
              calmar: 0.8,
            },
          },
          {
            statistics: {
              cagr: 0.15,
              maxDrawdown: 0.2,
              sharpe: 1.2,
              sortino: 1.4,
              stdev: 0.25,
              calmar: 0.5,
            },
          },
          {
            statistics: {
              cagr: 0.05,
              maxDrawdown: 0.1,
              sharpe: 0.8,
              sortino: 0.9,
              stdev: 0.15,
              calmar: 0.3,
            },
          },
        ],
      })
      .mockReturnValueOnce({
        portfolios: [{ growthCurve: [{ date: '2020-01-01', value: 10000 }] }],
      });

    const result = await executeOptimization(
      validBody({ constraints: { maxDrawdown: 15, minCagr: 8 } }),
    );
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).results).toHaveLength(1);
    expect((result.data as Record<string, unknown>).best).toBeDefined();
  });

  it('includes benchmark ticker in data fetch', async () => {
    mocks.numericRange.mockReturnValue([10000]);
    mocks.fetchHistoryData.mockResolvedValueOnce({
      AAPL: { '2020-01-01': 100 },
      SPY: { '2020-01-01': 300 },
    });
    mocks.runPortfolioBacktest
      .mockReturnValueOnce({
        portfolios: [
          {
            statistics: {
              cagr: 0.12,
              maxDrawdown: 0.15,
              sharpe: 1.5,
              sortino: 1.8,
              stdev: 0.2,
              calmar: 0.8,
            },
          },
          {
            statistics: {
              cagr: 0.1,
              maxDrawdown: 0.2,
              sharpe: 1.2,
              sortino: 1.4,
              stdev: 0.25,
              calmar: 0.5,
            },
          },
        ],
      })
      .mockReturnValueOnce({
        portfolios: [{ growthCurve: [{ date: '2020-01-01', value: 10000 }] }],
        benchmarkGrowth: [{ date: '2020-01-01', value: 30000 }],
      });

    const result = await executeOptimization(
      validBody({
        parameters: { startDate: '2020-01-01', endDate: '2020-12-31', benchmarkTicker: 'SPY' },
      }),
    );
    expect(result.success).toBe(true);
    expect(mocks.fetchHistoryData).toHaveBeenCalledWith(
      expect.arrayContaining(['AAPL', 'SPY']),
      '2020-01-01',
      '2020-12-31',
    );
  });
});
