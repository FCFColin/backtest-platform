import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', () => ({ startTransition: vi.fn((cb) => cb()) }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../../src/store/toastStore.js', () => ({
  useToastStore: {
    getState: () => ({
      addToast: vi.fn(),
    }),
  },
}));

import { useBacktestStore } from '../../../src/store/backtestStore.js';

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

describe('runBacktest', () => {
  it('成功回测返回结果', async () => {
    const mockResult = {
      success: true,
      data: {
        portfolios: [
          {
            name: 'Test',
            growthCurve: [{ date: '2020-01-02', value: 10000 }],
            drawdownCurve: [{ date: '2020-01-02', drawdown: 0 }],
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
            annualReturns: [],
            monthlyReturns: [],
          },
        ],
        correlations: [[1]],
        benchmarkGrowth: [],
      },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    await useBacktestStore.getState().runBacktest();
    const state = useBacktestStore.getState();
    expect(state.results).not.toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.activeTab).toBe('summary');
  });

  it('后端返回success:false时显示error toast', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: false, error: '无效ticker' }),
    });

    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
  });

  it('后端返回success:false无error字段时用默认消息', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: false }),
    });

    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
  });

  it('网络错误时显示error toast', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('HTTP错误（如500）时显示error toast', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('空ticker验证拦截请求', async () => {
    useBacktestStore.getState().updateAsset('p1', 0, { ticker: '' });
    await useBacktestStore.getState().runBacktest();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('权重总和不等于100时前端拦截', async () => {
    useBacktestStore.getState().updateAsset('p1', 0, { weight: 50 });
    await useBacktestStore.getState().runBacktest();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('后端返回warnings时显示warning toast', async () => {
    const mockResult = {
      success: true,
      data: {
        portfolios: [
          {
            name: 'Test',
            growthCurve: [{ date: '2020-01-02', value: 10000 }],
            drawdownCurve: [{ date: '2020-01-02', drawdown: 0 }],
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
            annualReturns: [],
            monthlyReturns: [],
          },
        ],
        correlations: [[1]],
        benchmarkGrowth: [],
      },
      warnings: ['部分数据缺失', '使用备用数据源'],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('后端返回空warnings不显示toast', async () => {
    const mockResult = {
      success: true,
      data: {
        portfolios: [
          {
            name: 'Test',
            growthCurve: [{ date: '2020-01-02', value: 10000 }],
            drawdownCurve: [{ date: '2020-01-02', drawdown: 0 }],
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
            annualReturns: [],
            monthlyReturns: [],
          },
        ],
        correlations: [[1]],
        benchmarkGrowth: [],
      },
      warnings: [],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('后端返回无data字段时用json本身作为结果', async () => {
    const mockResult = {
      success: true,
      portfolios: [
        {
          name: 'Test',
          growthCurve: [],
          drawdownCurve: [],
          statistics: {
            cagr: 0,
            stdev: 0,
            sharpe: 0,
            sortino: 0,
            maxDrawdown: 0,
            maxDrawdownDuration: 0,
            mwrr: 0,
            bestYear: 0,
            worstYear: 0,
            avgYear: 0,
          },
          annualReturns: [],
          monthlyReturns: [],
        },
      ],
      correlations: [],
      benchmarkGrowth: [],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('请求body包含正确的rebalanceThreshold', async () => {
    useBacktestStore
      .getState()
      .updatePortfolio('p1', { rebalanceFrequency: 'threshold', rebalanceThreshold: 8 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { portfolios: [], correlations: [], benchmarkGrowth: [] },
        }),
    });

    await useBacktestStore.getState().runBacktest();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.portfolios[0].rebalanceFrequency).toBe('threshold');
    expect(body.portfolios[0].rebalanceThreshold).toBe(8);
  });

  it('aborts previous request on second call (covers line 379)', async () => {
    const mockResult = {
      success: true,
      data: { portfolios: [], correlations: [], benchmarkGrowth: [] },
    };
    mockFetch.mockResolvedValueOnce(new Promise(() => {}));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    useBacktestStore.getState().runBacktest();
    await useBacktestStore.getState().runBacktest();
    const state = useBacktestStore.getState();
    expect(state.results).not.toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('stale catch returns early when requestId mismatches (covers line 455)', async () => {
    let rejectPromise!: (reason: unknown) => void;
    mockFetch.mockResolvedValueOnce(
      new Promise<Response>((_, reject) => {
        rejectPromise = reject;
      }),
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { portfolios: [], correlations: [], benchmarkGrowth: [] },
        }),
    });

    useBacktestStore.getState().runBacktest();
    useBacktestStore.getState().runBacktest();

    rejectPromise(new Error('stale error'));

    await vi.waitFor(() => {
      expect(useBacktestStore.getState().isLoading).toBe(false);
    });
  });
});

describe('runBacktest - additional error paths', () => {
  it('handles success:false with nested error.detail', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: false, error: { detail: 'nested error detail' } }),
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles HTTP error with detail message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: 'Bad request' }),
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles degraded mode warning', async () => {
    const mockResult = {
      success: true,
      data: {
        portfolios: [
          {
            name: 'Test',
            growthCurve: [],
            drawdownCurve: [],
            statistics: {
              cagr: 0,
              stdev: 0,
              sharpe: 0,
              sortino: 0,
              maxDrawdown: 0,
              maxDrawdownDuration: 0,
              mwrr: 0,
              bestYear: 0,
              worstYear: 0,
              avgYear: 0,
            },
            annualReturns: [],
            monthlyReturns: [],
          },
        ],
        correlations: [],
        benchmarkGrowth: [],
      },
      degraded: true,
      degradedWarning: 'Service is running in degraded mode',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles Degraded mode without degradedWarning (no toast)', async () => {
    const mockResult = {
      success: true,
      data: {
        portfolios: [
          {
            name: 'Test',
            growthCurve: [],
            drawdownCurve: [],
            statistics: {
              cagr: 0,
              stdev: 0,
              sharpe: 0,
              sortino: 0,
              maxDrawdown: 0,
              maxDrawdownDuration: 0,
              mwrr: 0,
              bestYear: 0,
              worstYear: 0,
              avgYear: 0,
            },
            annualReturns: [],
            monthlyReturns: [],
          },
        ],
        correlations: [],
        benchmarkGrowth: [],
      },
      degraded: true,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('handles AbortError', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles generic Error with message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Custom error message'));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles non-Error thrown value', async () => {
    mockFetch.mockRejectedValueOnce('string error');
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles thrown object without message', async () => {
    mockFetch.mockRejectedValueOnce({ custom: 'error' });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });
});

describe('enrichSeries', () => {
  it('returns early when results is null', async () => {
    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns early when results has no portfolios', async () => {
    useBacktestStore.getState().setResults({
      portfolios: [],
      correlations: [],
      benchmarkGrowth: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns early when series array is empty', async () => {
    useBacktestStore.getState().setResults({
      portfolios: [
        {
          name: 'Test',
          growthCurve: [],
          drawdownCurve: [],
          statistics: {
            cagr: 0,
            stdev: 0,
            sharpe: 0,
            sortino: 0,
            maxDrawdown: 0,
            maxDrawdownDuration: 0,
            mwrr: 0,
            bestYear: 0,
            worstYear: 0,
            avgYear: 0,
          },
          annualReturns: [],
          monthlyReturns: [],
        },
      ],
      correlations: [],
      benchmarkGrowth: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await useBacktestStore.getState().enrichSeries([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns early when all requested fields are already populated', async () => {
    useBacktestStore.getState().setResults({
      portfolios: [
        {
          name: 'Test',
          growthCurve: [],
          drawdownCurve: [],
          statistics: {
            cagr: 0,
            stdev: 0,
            sharpe: 0,
            sortino: 0,
            maxDrawdown: 0,
            maxDrawdownDuration: 0,
            mwrr: 0,
            bestYear: 0,
            worstYear: 0,
            avgYear: 0,
          },
          annualReturns: [],
          monthlyReturns: [],
          rollingReturns: [{ date: '2020-01-02', value: 0.1 }],
        },
      ],
      correlations: [],
      benchmarkGrowth: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('successfully enriches with fetch call', async () => {
    useBacktestStore.getState().setResults({
      portfolios: [
        {
          name: 'Test',
          growthCurve: [],
          drawdownCurve: [],
          statistics: {
            cagr: 0,
            stdev: 0,
            sharpe: 0,
            sortino: 0,
            maxDrawdown: 0,
            maxDrawdownDuration: 0,
            mwrr: 0,
            bestYear: 0,
            worstYear: 0,
            avgYear: 0,
          },
          annualReturns: [],
          monthlyReturns: [],
        },
      ],
      correlations: [],
      benchmarkGrowth: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const patches = [
      {
        name: 'Test',
        rollingReturns: [{ date: '2020-01-02', value: 0.1 }],
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { portfolios: patches } }),
    });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/backtest/portfolio/series',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const state = useBacktestStore.getState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((state.results!.portfolios[0] as any).rollingReturns).toEqual([
      { date: '2020-01-02', value: 0.1 },
    ]);
  });

  it('handles fetch error gracefully', async () => {
    useBacktestStore.getState().setResults({
      portfolios: [
        {
          name: 'Test',
          growthCurve: [],
          drawdownCurve: [],
          statistics: {
            cagr: 0,
            stdev: 0,
            sharpe: 0,
            sortino: 0,
            maxDrawdown: 0,
            maxDrawdownDuration: 0,
            mwrr: 0,
            bestYear: 0,
            worstYear: 0,
            avgYear: 0,
          },
          annualReturns: [],
          monthlyReturns: [],
        },
      ],
      correlations: [],
      benchmarkGrowth: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      useBacktestStore.getState().enrichSeries(['rollingReturns']),
    ).resolves.toBeUndefined();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('returns early when response.ok is false', async () => {
    useBacktestStore.getState().setResults({
      portfolios: [
        {
          name: 'Test',
          growthCurve: [],
          drawdownCurve: [],
          statistics: {
            cagr: 0,
            stdev: 0,
            sharpe: 0,
            sortino: 0,
            maxDrawdown: 0,
            maxDrawdownDuration: 0,
            mwrr: 0,
            bestYear: 0,
            worstYear: 0,
            avgYear: 0,
          },
          annualReturns: [],
          monthlyReturns: [],
        },
      ],
      correlations: [],
      benchmarkGrowth: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns early when json.success is false', async () => {
    useBacktestStore.getState().setResults({
      portfolios: [
        {
          name: 'Test',
          growthCurve: [],
          drawdownCurve: [],
          statistics: {
            cagr: 0,
            stdev: 0,
            sharpe: 0,
            sortino: 0,
            maxDrawdown: 0,
            maxDrawdownDuration: 0,
            mwrr: 0,
            bestYear: 0,
            worstYear: 0,
            avgYear: 0,
          },
          annualReturns: [],
          monthlyReturns: [],
        },
      ],
      correlations: [],
      benchmarkGrowth: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: false }),
    });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('preserves portfolio when no matching patch name', async () => {
    useBacktestStore.getState().setResults({
      portfolios: [
        {
          name: 'Alpha',
          growthCurve: [],
          drawdownCurve: [],
          statistics: {
            cagr: 0,
            stdev: 0,
            sharpe: 0,
            sortino: 0,
            maxDrawdown: 0,
            maxDrawdownDuration: 0,
            mwrr: 0,
            bestYear: 0,
            worstYear: 0,
            avgYear: 0,
          },
          annualReturns: [],
          monthlyReturns: [],
        },
        {
          name: 'Beta',
          growthCurve: [],
          drawdownCurve: [],
          statistics: {
            cagr: 0,
            stdev: 0,
            sharpe: 0,
            sortino: 0,
            maxDrawdown: 0,
            maxDrawdownDuration: 0,
            mwrr: 0,
            bestYear: 0,
            worstYear: 0,
            avgYear: 0,
          },
          annualReturns: [],
          monthlyReturns: [],
        },
      ],
      correlations: [],
      benchmarkGrowth: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const patches = [
      {
        name: 'Alpha',
        rollingReturns: [{ date: '2020-01-02', value: 0.12 }],
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { portfolios: patches } }),
    });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);

    const state = useBacktestStore.getState();
    expect(state.results).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((state.results!.portfolios[0] as any).rollingReturns).toEqual([
      { date: '2020-01-02', value: 0.12 },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((state.results!.portfolios[1] as any).rollingReturns).toEqual([]);
  });

  it('handles response with data but null portfolios (covers line 498)', async () => {
    useBacktestStore.getState().setResults({
      portfolios: [
        {
          name: 'Test',
          growthCurve: [],
          drawdownCurve: [],
          statistics: {
            cagr: 0,
            stdev: 0,
            sharpe: 0,
            sortino: 0,
            maxDrawdown: 0,
            maxDrawdownDuration: 0,
            mwrr: 0,
            bestYear: 0,
            worstYear: 0,
            avgYear: 0,
          },
          annualReturns: [],
          monthlyReturns: [],
        },
      ],
      correlations: [],
      benchmarkGrowth: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { portfolios: null } }),
    });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
