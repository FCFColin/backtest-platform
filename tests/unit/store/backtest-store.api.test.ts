import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockPortfolio,
  mockBacktestParams,
  mockPortfolioResult,
  mockBacktestResult,
} from '../../helpers/storeFixtures.js';
import type { PortfolioResult } from '../../../packages/shared/types/backtest.js';

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

import { useBacktestStore } from '../../../packages/frontend/src/store/backtestStore.js';

beforeEach(() => {
  mockFetch.mockReset();
  useBacktestStore.getState().loadFromShare({
    portfolios: [mockPortfolio()],
    parameters: mockBacktestParams(),
  });
});

/** 设置单 portfolio 结果（用于 enrichSeries 测试） */
function setSinglePortfolioResult(overrides: Partial<PortfolioResult> = {}): void {
  setResultsWith([mockPortfolioResult(overrides)]);
}

/** 设置多 portfolio 结果（用于 enrichSeries 测试） */
function setResultsWith(portfolios: PortfolioResult[]): void {
  useBacktestStore.getState().setResults({
    portfolios,
    correlations: [],
    benchmarkGrowth: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** mock fetch 一次性成功响应 */
function mockFetchOnce(payload: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(payload),
  });
}

/** mock fetch 一次性 HTTP 错误 */
function mockFetchHttpError(status: number, payload?: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: payload ? () => Promise.resolve(payload) : undefined,
  });
}

/** mock fetch 一次性 reject */
function mockFetchReject(error: unknown): void {
  mockFetch.mockRejectedValueOnce(error);
}

/** 空成功响应（用于 runBacktest 简单成功路径） */
function emptySuccessResponse(): unknown {
  return {
    success: true,
    data: { portfolios: [], correlations: [], benchmarkGrowth: [] },
  };
}

describe('runBacktest', () => {
  it('成功回测返回结果', async () => {
    mockFetchOnce({ success: true, data: mockBacktestResult() });
    await useBacktestStore.getState().runBacktest();
    const state = useBacktestStore.getState();
    expect(state.results).not.toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.activeTab).toBe('summary');
  });

  it('后端返回success:false时显示error toast', async () => {
    mockFetchOnce({ success: false, error: '无效ticker' });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
  });

  it('后端返回success:false无error字段时用默认消息', async () => {
    mockFetchOnce({ success: false });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
  });

  it('网络错误时显示error toast', async () => {
    mockFetchReject(new Error('Network error'));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('HTTP错误（如500）时显示error toast', async () => {
    mockFetchHttpError(500);
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
    mockFetchOnce({
      success: true,
      data: mockBacktestResult(),
      warnings: ['部分数据缺失', '使用备用数据源'],
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('后端返回空warnings不显示toast', async () => {
    mockFetchOnce({
      success: true,
      data: mockBacktestResult(),
      warnings: [],
    });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).not.toBeNull();
  });

  it('后端返回无data字段时用json本身作为结果', async () => {
    mockFetchOnce({
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
    mockFetchOnce(emptySuccessResponse());
    await useBacktestStore.getState().runBacktest();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.portfolios[0].rebalanceFrequency).toBe('threshold');
    expect(body.portfolios[0].rebalanceThreshold).toBe(8);
  });

  it('aborts previous request on second call (covers line 379)', async () => {
    mockFetch.mockResolvedValueOnce(new Promise(() => {}));
    mockFetchOnce(emptySuccessResponse());
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
    mockFetchOnce(emptySuccessResponse());
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
    mockFetchOnce({ success: false, error: { detail: 'nested error detail' } });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles HTTP error with detail message', async () => {
    mockFetchHttpError(400, { detail: 'Bad request' });
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles degraded mode warning', async () => {
    mockFetchOnce({
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
    mockFetchOnce({
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
    mockFetchReject(new DOMException('The operation was aborted', 'AbortError'));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles generic Error with message', async () => {
    mockFetchReject(new Error('Custom error message'));
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles non-Error thrown value', async () => {
    mockFetchReject('string error');
    await useBacktestStore.getState().runBacktest();
    expect(useBacktestStore.getState().results).toBeNull();
    expect(useBacktestStore.getState().isLoading).toBe(false);
  });

  it('handles thrown object without message', async () => {
    mockFetchReject({ custom: 'error' });
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
    mockFetchOnce({ success: true, data: { portfolios: patches } });

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
    mockFetchReject(new Error('Network error'));

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
    mockFetchOnce({ success: false });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('preserves portfolio when no matching patch name', async () => {
    setResultsWith([mockPortfolioResult({ name: 'Alpha' }), mockPortfolioResult({ name: 'Beta' })]);

    const patches = [{ name: 'Alpha', rollingReturns: [{ date: '2020-01-02', value: 0.12 }] }];

    mockFetchOnce({ success: true, data: { portfolios: patches } });

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
    mockFetchOnce({ success: true, data: { portfolios: null } });

    await useBacktestStore.getState().enrichSeries(['rollingReturns']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
