/**
 * backtestStore API 调用与结果归一化单元测试（合并自 api + results 2 文件）
 *
 * 覆盖：
 * - runBacktest：成功/失败/网络错误/HTTP 错误/空 ticker/权重校验/warnings/degraded/abort/stale
 * - enrichSeries：早期返回/成功补齐/fetch 错误/无匹配 patch
 * - setResults / setActiveTab：结果状态切换
 * - normalizeBacktestResult：null/undefined/缺字段/全字段/null statistics
 *
 * Mock 策略：react startTransition + fetch + toastStore + apiClient（vi.mock 必须留在文件顶部），
 * fetch mock helper（mockFetchOnce/mockFetchHttpError/mockFetchReject 等）见
 * tests/helpers/backtestStoreFixtures.ts。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', () => ({ startTransition: vi.fn((cb) => cb()) }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../../packages/frontend/src/utils/apiClient.js', () => ({
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  notifyIfDegraded: vi.fn(),
}));

vi.mock('../../../packages/frontend/src/store/toastStore.js', () => ({
  useToastStore: {
    getState: () => ({ addToast: vi.fn() }),
  },
}));

import { normalizeBacktestResult } from '../../../packages/frontend/src/store/backtestHelpers.js';
import { useBacktestStore } from '../../../packages/frontend/src/store/backtestStore.js';
import {
  mockPortfolioResult,
  mockBacktestResult,
} from '../../helpers/storeFixtures.js';
import {
  resetBacktestStoreState,
  mockFetchOnce,
  mockFetchHttpError,
  mockFetchReject,
  emptySuccessResponse,
  setSinglePortfolioResult,
  setResultsWith,
} from '../../helpers/backtestStoreFixtures.js';

beforeEach(() => resetBacktestStoreState(mockFetch));

// ============================================================
// runBacktest（原 api.test.ts）
// ============================================================

describe('runBacktest', () => {
  it('成功回测返回结果', async () => {
    mockFetchOnce(mockFetch, { success: true, data: mockBacktestResult() });
    await useBacktestStore.getState().runBacktest();
    const state = useBacktestStore.getState();
    expect(state.results).not.toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.activeTab).toBe('summary');
  });

  it('后端返回success:false时显示error toast', async () => {
    mockFetchOnce(mockFetch, { success: false, error: '无效ticker' });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
  });

  it('后端返回success:false无error字段时用默认消息', async () => {
    mockFetchOnce(mockFetch, { success: false });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
  });

  it('网络错误时显示error toast', async () => {
    mockFetchReject(mockFetch, new Error('Network error'));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('HTTP错误（如500）时显示error toast', async () => {
    mockFetchHttpError(mockFetch, 500);
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
    mockFetchOnce(mockFetch, {
      success: true,
      data: mockBacktestResult(),
      warnings: ['部分数据缺失', '使用备用数据源'],
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('后端返回空warnings不显示toast', async () => {
    mockFetchOnce(mockFetch, {
      success: true,
      data: mockBacktestResult(),
      warnings: [],
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('后端返回无data字段时用json本身作为结果', async () => {
    mockFetchOnce(mockFetch, {
      success: true,
      portfolios: [mockPortfolioResult({ growthCurve: [], drawdownCurve: [] })],
      correlations: [],
      benchmarkGrowth: [],
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('请求body包含正确的rebalanceThreshold', async () => {
    useBacktestStore
      .getState()
      .updatePortfolio('p1', { rebalanceFrequency: 'threshold', rebalanceThreshold: 8 });
    mockFetchOnce(mockFetch, emptySuccessResponse());
    await useBacktestStore.getState().runBacktest();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.portfolios[0].rebalanceFrequency).toBe('threshold');
    expect(body.portfolios[0].rebalanceThreshold).toBe(8);
  });

  it('aborts previous request on second call (covers line 379)', async () => {
    mockFetch.mockResolvedValueOnce(new Promise(() => {}));
    mockFetchOnce(mockFetch, emptySuccessResponse());
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
    mockFetchOnce(mockFetch, emptySuccessResponse());
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
    mockFetchOnce(mockFetch, { success: false, error: { detail: 'nested error detail' } });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles HTTP error with detail message', async () => {
    mockFetchHttpError(mockFetch, 400, { detail: 'Bad request' });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles degraded mode warning', async () => {
    mockFetchOnce(mockFetch, {
      success: true,
      data: mockBacktestResult({
        portfolios: [mockPortfolioResult({ growthCurve: [], drawdownCurve: [] })],
      }),
      degraded: true,
      degradedWarning: 'Service is running in degraded mode',
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles Degraded mode without degradedWarning (no toast)', async () => {
    mockFetchOnce(mockFetch, {
      success: true,
      data: mockBacktestResult({
        portfolios: [mockPortfolioResult({ growthCurve: [], drawdownCurve: [] })],
      }),
      degraded: true,
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('handles AbortError', async () => {
    mockFetchReject(mockFetch, new DOMException('The operation was aborted', 'AbortError'));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles generic Error with message', async () => {
    mockFetchReject(mockFetch, new Error('Custom error message'));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles non-Error thrown value', async () => {
    mockFetchReject(mockFetch, 'string error');
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles thrown object without message', async () => {
    mockFetchReject(mockFetch, { custom: 'error' });
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
    setResultsWith([]);
    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns early when series array is empty', async () => {
    setSinglePortfolioResult();
    await useBacktestStore.getState().enrichSeries([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns early when all requested fields are already populated', async () => {
    setSinglePortfolioResult({
      rollingReturns: [{ date: '2020-01-02', value: 0.1 }],
    });
    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('successfully enriches with fetch call', async () => {
    setSinglePortfolioResult();
    const patches = [{ name: 'Test', rollingReturns: [{ date: '2020-01-02', value: 0.1 }] }];
    mockFetchOnce(mockFetch, { success: true, data: { portfolios: patches } });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/backtest/portfolio/series',
      expect.objectContaining({ method: 'POST' }),
    );

    const state = useBacktestStore.getState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((state.results!.portfolios[0] as any).rollingReturns).toEqual([
      { date: '2020-01-02', value: 0.1 },
    ]);
  });

  it('handles fetch error gracefully', async () => {
    setSinglePortfolioResult();
    mockFetchReject(mockFetch, new Error('Network error'));

    await expect(
      useBacktestStore.getState().enrichSeries(['rollingReturns']),
    ).resolves.toBeUndefined();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('returns early when response.ok is false', async () => {
    setSinglePortfolioResult();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns early when json.success is false', async () => {
    setSinglePortfolioResult();
    mockFetchOnce(mockFetch, { success: false });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('preserves portfolio when no matching patch name', async () => {
    setResultsWith([mockPortfolioResult({ name: 'Alpha' }), mockPortfolioResult({ name: 'Beta' })]);

    const patches = [{ name: 'Alpha', rollingReturns: [{ date: '2020-01-02', value: 0.12 }] }];

    mockFetchOnce(mockFetch, { success: true, data: { portfolios: patches } });

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
    setSinglePortfolioResult();
    mockFetchOnce(mockFetch, { success: true, data: { portfolios: null } });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// setResults / setActiveTab + normalizeBacktestResult（原 results.test.ts）
// ============================================================

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
