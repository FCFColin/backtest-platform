import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', () => ({ startTransition: vi.fn((cb) => cb()) }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../../packages/frontend/src/store/toastStore.js', () => ({
  useToastStore: {
    getState: () => ({
      addToast: vi.fn(),
    }),
  },
}));

import { normalizeBacktestResult } from '../../../packages/frontend/src/store/backtestHelpers.js';
import { useBacktestStore } from '../../../packages/frontend/src/store/backtestStore.js';

beforeEach(() => {
  mockFetch.mockReset();
  useBacktestStore.getState().loadFromShare({
    portfolios: [
      {
        id: 'p1',
        name: 'Portfolio 1',
        assets: [
          { ticker: 'VTI', weight: 60 },
          { ticker: 'BND', weight: 40 },
        ],
        rebalanceFrequency: 'quarterly',
      },
    ],
    parameters: {
      startDate: '2010-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      adjustForInflation: false,
      rollingWindowMonths: 12,
      benchmarkTicker: 'SPY',
    },
  });
});

describe('setResults / setActiveTab', () => {
  it('设置和清除结果', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResults = { portfolios: [], correlations: [], benchmarkGrowth: [] } as any;
    useBacktestStore.getState().setResults(mockResults);
    expect(useBacktestStore.getState().results).toEqual(mockResults);
    useBacktestStore.getState().setResults(null);
    expect(useBacktestStore.getState().results).toBeNull();
  });

  it('切换tab', () => {
    useBacktestStore.getState().setActiveTab('drawdown');
    expect(useBacktestStore.getState().activeTab).toBe('drawdown');
    useBacktestStore.getState().setActiveTab('rolling');
    expect(useBacktestStore.getState().activeTab).toBe('rolling');
    useBacktestStore.getState().setActiveTab('growth');
    expect(useBacktestStore.getState().activeTab).toBe('growth');
  });
});

describe('normalizeBacktestResult', () => {
  it('returns empty structure for null input', () => {
    const result = normalizeBacktestResult(null);
    expect(result.portfolios).toEqual([]);
    expect(result.correlations).toEqual([]);
    expect(result.benchmarkGrowth).toEqual([]);
    expect(result.assetTickers).toEqual([]);
    expect(result.assetCorrelations).toEqual([]);
  });

  it('returns empty structure for undefined input', () => {
    const result = normalizeBacktestResult(undefined);
    expect(result.portfolios).toEqual([]);
  });

  it('fills missing arrays in portfolio', () => {
    const input = {
      portfolios: [
        {
          name: 'Test',
          statistics: {
            cagr: 0.1,
            stdev: 0.2,
            sharpe: 0.5,
            sortino: 0.6,
            maxDrawdown: 0.3,
            maxDrawdownDuration: 5,
            mwrr: 0.1,
            bestYear: 0.2,
            worstYear: -0.1,
            avgYear: 0.1,
          },
        },
      ],
    };
    const result = normalizeBacktestResult(input);
    expect(result.portfolios[0].growthCurve).toEqual([]);
    expect(result.portfolios[0].drawdownCurve).toEqual([]);
    expect(result.portfolios[0].annualReturns).toEqual([]);
    expect(result.portfolios[0].monthlyReturns).toEqual([]);
    expect(result.portfolios[0].rollingReturns).toEqual([]);
    expect(result.portfolios[0].allocationHistory).toEqual([]);
    expect(result.portfolios[0].drawdownEpisodes).toEqual([]);
    expect(result.correlations).toEqual([]);
    expect(result.benchmarkGrowth).toEqual([]);
  });

  it('passes through full data', () => {
    const input = {
      portfolios: [
        {
          name: 'Test',
          growthCurve: [{ date: '2020-01-02', value: 10000 }],
          drawdownCurve: [{ date: '2020-01-02', drawdown: 0 }],
          annualReturns: [{ year: 2020, value: 0.1 }],
          monthlyReturns: [{ month: '2020-01', value: 0.01 }],
          rollingReturns: [{ date: '2020-01-02', value: 0.12 }],
          allocationHistory: [{ date: '2020-01-02', allocations: {} }],
          drawdownEpisodes: [
            {
              start: '2020-01-02',
              end: '2020-03-01',
              peak: 10000,
              trough: 9000,
              recovery: '2020-06-01',
            },
          ],
          statistics: {
            cagr: 0.069,
            stdev: 0.12,
            sharpe: 0.47,
            sortino: 0.6,
            maxDrawdown: 0.228,
            maxDrawdownDuration: 8,
            mwrr: 0.07,
            bestYear: 0.15,
            worstYear: -0.05,
            avgYear: 0.07,
          },
        },
      ],
      correlations: [[1]],
      assetTickers: ['VTI', 'BND'],
      assetCorrelations: [
        [1, 0.6],
        [0.6, 1],
      ],
      benchmarkGrowth: [{ date: '2020-01-02', value: 10000 }],
    };
    const result = normalizeBacktestResult(input);
    expect(result.portfolios[0].growthCurve).toEqual(input.portfolios[0].growthCurve);
    expect(result.portfolios[0].drawdownCurve).toEqual(input.portfolios[0].drawdownCurve);
    expect(result.portfolios[0].annualReturns).toEqual(input.portfolios[0].annualReturns);
    expect(result.portfolios[0].monthlyReturns).toEqual(input.portfolios[0].monthlyReturns);
    expect(result.portfolios[0].rollingReturns).toEqual(input.portfolios[0].rollingReturns);
    expect(result.portfolios[0].allocationHistory).toEqual(input.portfolios[0].allocationHistory);
    expect(result.portfolios[0].drawdownEpisodes).toEqual(input.portfolios[0].drawdownEpisodes);
    expect(result.portfolios[0].statistics).toEqual(input.portfolios[0].statistics);
    expect(result.correlations).toEqual([[1]]);
    expect(result.benchmarkGrowth).toEqual(input.benchmarkGrowth);
    expect(result.assetTickers).toEqual(['VTI', 'BND']);
    expect(result.assetCorrelations).toEqual([
      [1, 0.6],
      [0.6, 1],
    ]);
  });

  it('handles portfolio with null statistics', () => {
    const input = {
      portfolios: [
        {
          name: 'Test',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          statistics: null as any,
        },
      ],
    };
    const result = normalizeBacktestResult(input);
    expect(result.portfolios[0].statistics).toEqual({});
  });
});
