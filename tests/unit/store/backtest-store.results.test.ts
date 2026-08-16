import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resetBacktestStoreState,
  mockFetchOnce,
  mockFetchHttpError,
  mockFetchReject,
  emptySuccessResponse,
  setSinglePortfolioResult,
  setResultsWith,
  mockFetch,
} from '../../helpers/backtestStoreFixtures.js';
import { normalizeBacktestResult } from '../../../packages/frontend/src/store/backtestHelpers.js';
import { useBacktestStore } from '../../../packages/frontend/src/store/backtestStore.js';
import type { BacktestSeriesField } from '../../../packages/frontend/src/store/types.js';
import { mockBacktestResult, mockPortfolioResult } from '../../helpers/storeFixtures.js';
import { mockPortfolio, mockBacktestParams } from '../../helpers/storeFixtures.js';

const S = () => useBacktestStore.getState();
beforeEach(() => resetBacktestStoreState(mockFetch));
const okPayload = (extra: Record<string, unknown> = {}) => ({
  success: true,
  data: mockBacktestResult(),
  ...extra,
});
const emptyGrowth = () =>
  mockBacktestResult({ portfolios: [mockPortfolioResult({ growthCurve: [], drawdownCurve: [] })] });
const topLevelPayload = () => ({
  success: true,
  portfolios: [mockPortfolioResult({ growthCurve: [], drawdownCurve: [] })],
  correlations: [],
  benchmarkGrowth: [],
});

describe('setHasLoadedFromShare / setActiveTab / getShareableState', () => {
  it('sets the flag to true/false', () => {
    S().setHasLoadedFromShare(true);
    expect(S().hasLoadedFromShare).toBe(true);
    S().setHasLoadedFromShare(false);
    expect(S().hasLoadedFromShare).toBe(false);
  });
  it.each(['drawdown', 'rolling', 'growth'])('切换tab到%s', (tab) => {
    S().setActiveTab(tab);
    expect(S().activeTab).toBe(tab);
  });
  it('getShareableState 仅返回 portfolios 和 parameters', () => {
    const state = S();
    const shareable = state.getShareableState();
    expect(shareable).toHaveProperty('portfolios');
    expect(shareable).toHaveProperty('parameters');
    ['results', 'isLoading', 'activeTab'].forEach((k) => expect(shareable).not.toHaveProperty(k));
    expect(shareable.portfolios).toEqual(state.portfolios);
    expect(shareable.parameters).toEqual(state.parameters);
  });
});
describe('runBacktest', () => {
  it.each([
    ['成功', okPayload(), true],
    ['有warnings', okPayload({ warnings: ['部分数据缺失', '使用备用数据源'] }), false],
    ['空warnings', okPayload({ warnings: [] }), false],
    ['无data字段', topLevelPayload(), false],
    [
      'degraded with warning',
      okPayload({
        data: emptyGrowth(),
        degraded: true,
        degradedWarning: 'Service is running in degraded mode',
      }),
      false,
    ],
    ['degraded without warning', okPayload({ data: emptyGrowth(), degraded: true }), false],
  ])('后端返回%s时results不为null', async (_n, payload, checkTab) => {
    mockFetchOnce(mockFetch, payload);
    await S().runBacktest();
    expect(S().results).not.toBeNull();
    expect(S().isLoading).toBe(false);
    if (checkTab) expect(S().activeTab).toBe('summary');
  });
  it.each<[string, () => void]>([
    [
      'success:false有error',
      () => mockFetchOnce(mockFetch, { success: false, error: '无效ticker' }),
    ],
    ['success:false无error', () => mockFetchOnce(mockFetch, { success: false })],
    [
      'success:false嵌套error.detail',
      () => mockFetchOnce(mockFetch, { success: false, error: { detail: 'nested error detail' } }),
    ],
    ['网络错误', () => mockFetchReject(mockFetch, new Error('Network error'))],
    ['HTTP 500', () => mockFetchHttpError(mockFetch, 500)],
    ['HTTP 400 with detail', () => mockFetchHttpError(mockFetch, 400, { detail: 'Bad request' })],
    ['AbortError', () => mockFetchReject(mockFetch, new DOMException('aborted', 'AbortError'))],
    ['generic Error', () => mockFetchReject(mockFetch, new Error('Custom error message'))],
    ['non-Error string', () => mockFetchReject(mockFetch, 'string error')],
    ['thrown object', () => mockFetchReject(mockFetch, { custom: 'error' })],
  ])('后端失败：%s → results 为 null', async (_n, setup) => {
    setup();
    await S().runBacktest();
    expect(S().results).toBeNull();
    expect(S().isLoading).toBe(false);
  });
  it.each<[string, () => void, boolean]>([
    [
      '空ticker验证拦截请求',
      () =>
        S().updatePortfolio('p1', {
          assets: [
            { ticker: '', weight: 60 },
            { ticker: 'BND', weight: 40 },
          ],
        }),
      true,
    ],
    [
      '权重总和不等于100时前端拦截',
      () =>
        S().updatePortfolio('p1', {
          assets: [
            { ticker: 'VTI', weight: 50 },
            { ticker: 'BND', weight: 40 },
          ],
        }),
      false,
    ],
  ])('%s', async (_n, setup, skipLoadingCheck) => {
    setup();
    await S().runBacktest();
    expect(mockFetch).not.toHaveBeenCalled();
    if (!skipLoadingCheck) expect(S().isLoading).toBe(false);
  });
  it('请求body包含正确的rebalanceThreshold', async () => {
    S().updatePortfolio('p1', { rebalanceFrequency: 'threshold', rebalanceThreshold: 8 });
    mockFetchOnce(mockFetch, emptySuccessResponse());
    await S().runBacktest();
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).portfolios[0]).toMatchObject({
      rebalanceFrequency: 'threshold',
      rebalanceThreshold: 8,
    });
  });
  it('aborts previous request on second call; stale catch returns early when requestId mismatches', async () => {
    let reject!: (r: unknown) => void;
    mockFetch.mockResolvedValueOnce(
      new Promise<Response>((_, rej) => {
        reject = rej;
      }),
    );
    mockFetchOnce(mockFetch, emptySuccessResponse());
    S().runBacktest();
    await S().runBacktest();
    expect(S().results).not.toBeNull();
    expect(S().isLoading).toBe(false);
    reject(new Error('stale error'));
    await vi.waitFor(() => expect(S().isLoading).toBe(false));
  });
});
describe('resultsStale 过期标记', () => {
  it('参数变更标记过期，重新运行后清除', async () => {
    mockFetchOnce(mockFetch, okPayload());
    await S().runBacktest();
    expect(S().resultsStale).toBe(false);
    S().updateParameter('startingValue', 50000);
    expect(S().resultsStale).toBe(true);
    mockFetchOnce(mockFetch, okPayload());
    await S().runBacktest();
    expect(S().resultsStale).toBe(false);
  });
  it('组合变更标记过期', async () => {
    mockFetchOnce(mockFetch, okPayload());
    await S().runBacktest();
    S().updatePortfolio('p1', { drag: 1 });
    expect(S().resultsStale).toBe(true);
  });
  it('loadFromShare 重置过期标记', () => {
    S().updateParameter('startingValue', 50000);
    expect(S().resultsStale).toBe(true);
    S().loadFromShare({ portfolios: [mockPortfolio()], parameters: mockBacktestParams() });
    expect(S().resultsStale).toBe(false);
  });
});
describe('enrichSeries', () => {
  it.each<[string, () => void, BacktestSeriesField[], boolean]>([
    ['results is null', () => {}, ['rollingReturns'], false],
    ['no portfolios', () => setResultsWith([]), ['rollingReturns'], false],
    ['empty series array', () => setSinglePortfolioResult(), [], false],
    [
      'all fields populated',
      () => setSinglePortfolioResult({ rollingReturns: [{ date: '2020-01-02', return: 0.1 }] }),
      ['rollingReturns'],
      false,
    ],
    [
      'response.ok is false',
      () => {
        setSinglePortfolioResult();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        });
      },
      ['rollingReturns'],
      true,
    ],
    [
      'json.success is false',
      () => {
        setSinglePortfolioResult();
        mockFetchOnce(mockFetch, { success: false });
      },
      ['rollingReturns'],
      true,
    ],
    [
      'data with null portfolios',
      () => {
        setSinglePortfolioResult();
        mockFetchOnce(mockFetch, { success: true, data: { portfolios: null } });
      },
      ['rollingReturns'],
      true,
    ],
  ])('returns early when %s', async (_n, setup, series, fetchCalled) => {
    setup();
    await S().enrichSeries(series);
    if (fetchCalled) expect(mockFetch).toHaveBeenCalledTimes(1);
    else expect(mockFetch).not.toHaveBeenCalled();
  });
  it('successfully enriches with fetch call', async () => {
    setSinglePortfolioResult();
    mockFetchOnce(mockFetch, {
      success: true,
      data: {
        portfolios: [{ name: 'Test', rollingReturns: [{ date: '2020-01-02', value: 0.1 }] }],
      },
    });
    await S().enrichSeries(['rollingReturns']);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/backtest/portfolio/series',
      expect.objectContaining({ method: 'POST' }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((S().results!.portfolios[0] as any).rollingReturns).toEqual([
      { date: '2020-01-02', value: 0.1 },
    ]);
  });
  it('handles fetch error gracefully', async () => {
    setSinglePortfolioResult();
    mockFetchReject(mockFetch, new Error('Network error'));
    await expect(S().enrichSeries(['rollingReturns'])).resolves.toBeUndefined();
    expect(S().results).not.toBeNull();
  });
  it('preserves portfolio when no matching patch name', async () => {
    setResultsWith([mockPortfolioResult({ name: 'Alpha' }), mockPortfolioResult({ name: 'Beta' })]);
    mockFetchOnce(mockFetch, {
      success: true,
      data: {
        portfolios: [{ name: 'Alpha', rollingReturns: [{ date: '2020-01-02', value: 0.12 }] }],
      },
    });
    await S().enrichSeries(['rollingReturns']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = S().results!.portfolios as any[];
    expect(p[0].rollingReturns).toEqual([{ date: '2020-01-02', value: 0.12 }]);
    expect(p[1].rollingReturns).toEqual([]);
  });
});
const STATS = {
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
};
describe('normalizeBacktestResult', () => {
  it.each([null, undefined])('returns empty structure for %s input', (input) => {
    const r = normalizeBacktestResult(input);
    expect(r.portfolios).toEqual([]);
    expect(r.correlations).toEqual([]);
    expect(r.benchmarkGrowth).toEqual([]);
  });
  it('fills missing arrays in portfolio', () => {
    expect(
      normalizeBacktestResult({ portfolios: [{ name: 'Test', statistics: STATS }] }).portfolios[0],
    ).toMatchObject({
      growthCurve: [],
      drawdownCurve: [],
      annualReturns: [],
      monthlyReturns: [],
      rollingReturns: [],
      allocationHistory: [],
      drawdownEpisodes: [],
    });
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
          statistics: STATS,
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
    const r = normalizeBacktestResult(input);
    expect(r.portfolios[0]).toMatchObject(input.portfolios[0]);
    expect(r).toMatchObject({
      correlations: [[1]],
      assetTickers: ['VTI', 'BND'],
      assetCorrelations: [
        [1, 0.6],
        [0.6, 1],
      ],
      benchmarkGrowth: input.benchmarkGrowth,
    });
  });
  it('handles portfolio with null statistics', () => {
    expect(
      normalizeBacktestResult({
        portfolios: [{ name: 'Test', statistics: null as unknown as Record<string, never> }],
      }).portfolios[0].statistics,
    ).toEqual({});
  });
});
