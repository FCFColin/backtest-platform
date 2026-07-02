import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock startTransition to execute synchronously
vi.mock('react', () => ({ startTransition: vi.fn((cb) => cb()) }));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock toast store
vi.mock('../../../src/store/toastStore.js', () => ({
  useToastStore: {
    getState: () => ({
      addToast: vi.fn(),
    }),
  },
}));

import {
  useBacktestStore,
  extractApiErrorDetail,
  normalizeBacktestResult,
} from '../../../src/store/backtestStore.js';

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

// ===== addPortfolio =====
describe('addPortfolio', () => {
  it('添加新组合，包含默认VTI+BND', () => {
    useBacktestStore.getState().addPortfolio();
    const after = useBacktestStore.getState().portfolios;
    expect(after.length).toBe(2);
    expect(after[1].assets[0].ticker).toBe('VTI');
    expect(after[1].assets[0].weight).toBe(60);
    expect(after[1].assets[1].ticker).toBe('BND');
    expect(after[1].assets[1].weight).toBe(40);
    expect(after[1].rebalanceFrequency).toBe('quarterly');
  });
});

// ===== duplicatePortfolio =====
describe('duplicatePortfolio', () => {
  it('复制存在的组合', () => {
    useBacktestStore.getState().duplicatePortfolio('p1');
    const after = useBacktestStore.getState().portfolios;
    expect(after.length).toBe(2);
    expect(after[1].name).toBe('Portfolio 1 (副本)');
    expect(after[1].assets).toEqual(after[0].assets);
    expect(after[1].id).not.toBe('p1');
  });

  it('复制不存在的id，不增加组合', () => {
    useBacktestStore.getState().duplicatePortfolio('not-exist');
    expect(useBacktestStore.getState().portfolios.length).toBe(1);
  });

  it('复制后修改副本不影响原组合', () => {
    useBacktestStore.getState().duplicatePortfolio('p1');
    const copyId = useBacktestStore.getState().portfolios[1].id;
    useBacktestStore.getState().updateAsset(copyId, 0, { weight: 80 });
    const after = useBacktestStore.getState().portfolios;
    expect(after[0].assets[0].weight).toBe(60); // 原组合不变
    expect(after[1].assets[0].weight).toBe(80); // 副本已修改
  });
});

// ===== removePortfolio =====
describe('removePortfolio', () => {
  it('只有1个组合时不能删除', () => {
    useBacktestStore.getState().removePortfolio('p1');
    expect(useBacktestStore.getState().portfolios.length).toBe(1);
  });

  it('有2个组合时可以删除', () => {
    useBacktestStore.getState().addPortfolio();
    const secondId = useBacktestStore.getState().portfolios[1].id;
    useBacktestStore.getState().removePortfolio(secondId);
    expect(useBacktestStore.getState().portfolios.length).toBe(1);
    expect(useBacktestStore.getState().portfolios[0].id).toBe('p1');
  });

  it('删除不存在的id无影响', () => {
    useBacktestStore.getState().removePortfolio('not-exist');
    expect(useBacktestStore.getState().portfolios.length).toBe(1);
  });
});

// ===== addAsset =====
describe('addAsset', () => {
  it('添加空资产到存在的组合', () => {
    useBacktestStore.getState().addAsset('p1');
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets.length).toBe(3);
    expect(after.assets[2]).toMatchObject({ ticker: '', weight: 0 });
    expect(after.assets[2].id).toBeTruthy();
  });

  it('添加到不存在的组合无影响', () => {
    useBacktestStore.getState().addAsset('not-exist');
    expect(useBacktestStore.getState().portfolios[0].assets.length).toBe(2);
  });
});

// ===== removeAsset =====
describe('removeAsset', () => {
  it('删除存在的资产', () => {
    useBacktestStore.getState().removeAsset('p1', 'VTI');
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets.length).toBe(1);
    expect(after.assets[0].ticker).toBe('BND');
  });

  it('删除不存在的ticker无影响', () => {
    useBacktestStore.getState().removeAsset('p1', 'NOTEXIST');
    expect(useBacktestStore.getState().portfolios[0].assets.length).toBe(2);
  });

  it('从不存在的组合删除无影响', () => {
    useBacktestStore.getState().removeAsset('not-exist', 'VTI');
    expect(useBacktestStore.getState().portfolios[0].assets.length).toBe(2);
  });
});

// ===== updateAsset =====
describe('updateAsset', () => {
  it('更新存在的资产权重', () => {
    useBacktestStore.getState().updateAsset('p1', 0, { weight: 70 });
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets[0].weight).toBe(70);
    expect(after.assets[1].weight).toBe(40); // BND不变
  });

  it('更新存在的资产ticker', () => {
    useBacktestStore.getState().updateAsset('p1', 0, { ticker: 'SPY' });
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets[0].ticker).toBe('SPY');
  });

  it('更新越界index无影响', () => {
    useBacktestStore.getState().updateAsset('p1', 99, { weight: 50 });
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets[0].weight).toBe(60); // 不变
  });

  it('更新不存在的组合无影响', () => {
    useBacktestStore.getState().updateAsset('not-exist', 0, { weight: 50 });
    expect(useBacktestStore.getState().portfolios[0].assets[0].weight).toBe(60);
  });
});

// ===== updatePortfolio =====
describe('updatePortfolio', () => {
  it('更新名称', () => {
    useBacktestStore.getState().updatePortfolio('p1', { name: '我的组合' });
    expect(useBacktestStore.getState().portfolios[0].name).toBe('我的组合');
  });

  it('更新调仓频率', () => {
    useBacktestStore.getState().updatePortfolio('p1', { rebalanceFrequency: 'monthly' });
    expect(useBacktestStore.getState().portfolios[0].rebalanceFrequency).toBe('monthly');
  });

  it('更新偏离调仓阈值', () => {
    useBacktestStore
      .getState()
      .updatePortfolio('p1', { rebalanceFrequency: 'threshold', rebalanceThreshold: 10 });
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.rebalanceFrequency).toBe('threshold');
    expect(after.rebalanceThreshold).toBe(10);
  });

  it('更新不存在的组合无影响', () => {
    useBacktestStore.getState().updatePortfolio('not-exist', { name: '不存在' });
    expect(useBacktestStore.getState().portfolios[0].name).toBe('Portfolio 1');
  });
});

// ===== updateParameter =====
describe('updateParameter', () => {
  it('更新startingValue', () => {
    useBacktestStore.getState().updateParameter('startingValue', 50000);
    expect(useBacktestStore.getState().parameters.startingValue).toBe(50000);
  });

  it('更新startDate', () => {
    useBacktestStore.getState().updateParameter('startDate', '2015-01-01');
    expect(useBacktestStore.getState().parameters.startDate).toBe('2015-01-01');
  });

  it('更新endDate', () => {
    useBacktestStore.getState().updateParameter('endDate', '2023-12-31');
    expect(useBacktestStore.getState().parameters.endDate).toBe('2023-12-31');
  });

  it('更新benchmarkTicker', () => {
    useBacktestStore.getState().updateParameter('benchmarkTicker', '');
    expect(useBacktestStore.getState().parameters.benchmarkTicker).toBe('');
  });

  it('更新adjustForInflation', () => {
    useBacktestStore.getState().updateParameter('adjustForInflation', true);
    expect(useBacktestStore.getState().parameters.adjustForInflation).toBe(true);
  });

  it('更新rollingWindowMonths', () => {
    useBacktestStore.getState().updateParameter('rollingWindowMonths', 6);
    expect(useBacktestStore.getState().parameters.rollingWindowMonths).toBe(6);
  });
});

// ===== loadFromShare =====
describe('loadFromShare', () => {
  it('从分享数据加载，覆盖现有状态', () => {
    useBacktestStore.getState().loadFromShare({
      portfolios: [
        {
          id: 'shared-1',
          name: '分享组合',
          assets: [{ ticker: 'SPY', weight: 100 }],
          rebalanceFrequency: 'annual',
        },
      ],
      parameters: {
        startDate: '2015-01-01',
        endDate: '2024-12-31',
        startingValue: 20000,
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
      },
    });
    const state = useBacktestStore.getState();
    expect(state.portfolios.length).toBe(1);
    expect(state.portfolios[0].name).toBe('分享组合');
    expect(state.portfolios[0].assets[0].ticker).toBe('SPY');
    expect(state.parameters.startingValue).toBe(20000);
    expect(state.results).toBeNull();
  });

  it('分享数据中无id时自动生成', () => {
    useBacktestStore.getState().loadFromShare({
      portfolios: [
        {
          name: '无ID组合',
          assets: [{ ticker: 'VTI', weight: 100 }],
          rebalanceFrequency: 'none',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
      parameters: {
        startDate: '2010-01-01',
        endDate: '2024-12-31',
        startingValue: 10000,
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
      },
    });
    const state = useBacktestStore.getState();
    expect(state.portfolios[0].id).toBeTruthy();
  });
});

// ===== runBacktest =====
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
    // never-resolving promise keeps first request pending
    mockFetch.mockResolvedValueOnce(new Promise(() => {}));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    useBacktestStore.getState().runBacktest(); // no await
    // second call triggers abort on the first
    await useBacktestStore.getState().runBacktest();
    const state = useBacktestStore.getState();
    expect(state.results).not.toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('stale catch returns early when requestId mismatches (covers line 455)', async () => {
    // First request will reject; second request starts before it settles
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

    useBacktestStore.getState().runBacktest(); // start first (no await)
    useBacktestStore.getState().runBacktest(); // start second – increments currentRequestId

    // Let first request reject – catch runs with stale requestId
    rejectPromise(new Error('stale error'));

    // Wait a tick for the rejection to be processed
    await vi.waitFor(() => {
      expect(useBacktestStore.getState().isLoading).toBe(false);
    });
  });
});

// ===== setResults / setActiveTab =====
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

// ===== extractApiErrorDetail =====
describe('extractApiErrorDetail', () => {
  it('returns detail field when present', () => {
    expect(extractApiErrorDetail({ detail: 'invalid ticker' })).toBe('invalid ticker');
  });

  it('detail takes priority over error field', () => {
    expect(extractApiErrorDetail({ detail: 'priority', error: 'ignored' })).toBe('priority');
  });

  it('returns error string when detail absent', () => {
    expect(extractApiErrorDetail({ error: 'something went wrong' })).toBe('something went wrong');
  });

  it('returns nested error.detail when error is object with detail', () => {
    expect(extractApiErrorDetail({ error: { detail: 'nested detail' } })).toBe('nested detail');
  });

  it('returns default for null', () => {
    const result = extractApiErrorDetail(null);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns default for undefined', () => {
    const result = extractApiErrorDetail(undefined);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns default for primitive string', () => {
    const result = extractApiErrorDetail('hello');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns default for number', () => {
    const result = extractApiErrorDetail(42);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns default for empty object', () => {
    const result = extractApiErrorDetail({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ===== normalizeBacktestResult =====
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

// ===== runBacktest - additional error paths =====
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

// ===== enrichSeries =====
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

    // Only patch for 'Alpha' — 'Beta' has no match, so line 509 branch is exercised
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
    // portfolios unchanged (no patches applied)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ===== addGlidepath =====
describe('addGlidepath', () => {
  it('does not add when from portfolio not found', () => {
    const before = useBacktestStore.getState().portfolios.length;
    useBacktestStore.getState().addGlidepath('Glidepath', 'non-existent', 'p1', 5);
    expect(useBacktestStore.getState().portfolios.length).toBe(before);
  });

  it('does not add when to portfolio not found', () => {
    const before = useBacktestStore.getState().portfolios.length;
    useBacktestStore.getState().addGlidepath('Glidepath', 'p1', 'non-existent', 5);
    expect(useBacktestStore.getState().portfolios.length).toBe(before);
  });

  it('does not add when both from and to portfolios not found', () => {
    const before = useBacktestStore.getState().portfolios.length;
    useBacktestStore.getState().addGlidepath('Glidepath', 'x', 'y', 5);
    expect(useBacktestStore.getState().portfolios.length).toBe(before);
  });

  it('creates glidepath when both portfolios exist', () => {
    useBacktestStore.getState().addPortfolio();
    const before = useBacktestStore.getState().portfolios.length;
    const p1Id = useBacktestStore.getState().portfolios[0].id;
    const p2Id = useBacktestStore.getState().portfolios[1].id;
    useBacktestStore.getState().addGlidepath('My Glidepath', p1Id, p2Id, 10);
    expect(useBacktestStore.getState().portfolios.length).toBe(before + 1);
    const gp = useBacktestStore.getState().portfolios[2];
    expect(gp.isGlidepath).toBe(true);
    expect(gp.name).toBe('My Glidepath');
    expect(gp.glidepathFrom).toBe(p1Id);
    expect(gp.glidepathTo).toBe(p2Id);
    expect(gp.glidepathYears).toBe(10);
    expect(gp.assets).toEqual(useBacktestStore.getState().portfolios[0].assets);
  });
});

// ===== batchUpdateAssets =====
describe('batchUpdateAssets', () => {
  it('updates weights for matching indices', () => {
    useBacktestStore.getState().batchUpdateAssets('p1', [
      { index: 0, weight: 50 },
      { index: 1, weight: 50 },
    ]);
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets[0].weight).toBe(50);
    expect(after.assets[1].weight).toBe(50);
  });

  it('ignores non-matching portfolioId', () => {
    useBacktestStore.getState().batchUpdateAssets('non-existent', [{ index: 0, weight: 100 }]);
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets[0].weight).toBe(60);
    expect(after.assets[1].weight).toBe(40);
  });

  it('skips indices that do not exist in portfolio', () => {
    useBacktestStore.getState().batchUpdateAssets('p1', [
      { index: 0, weight: 80 },
      { index: 99, weight: 20 },
    ]);
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets[0].weight).toBe(80);
    expect(after.assets[1].weight).toBe(40);
  });
});

// ===== loadFromShare - edge cases =====
describe('loadFromShare - edge cases', () => {
  it('handles portfolio id with no numeric suffix', () => {
    useBacktestStore.getState().loadFromShare({
      portfolios: [
        {
          id: 'custom-portfolio',
          name: 'Custom',
          assets: [{ ticker: 'SPY', weight: 100 }],
          rebalanceFrequency: 'none',
        },
      ],
      parameters: {
        startDate: '2010-01-01',
        endDate: '2024-12-31',
        startingValue: 10000,
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
      },
    });
    const state = useBacktestStore.getState();
    expect(state.portfolios.length).toBe(1);
    expect(state.portfolios[0].id).toBe('custom-portfolio');
  });

  it('handles portfolio id ending with non-numeric suffix', () => {
    useBacktestStore.getState().loadFromShare({
      portfolios: [
        {
          id: 'portfolio-abc',
          name: 'Alpha',
          assets: [{ ticker: 'BND', weight: 100 }],
          rebalanceFrequency: 'monthly',
        },
      ],
      parameters: {
        startDate: '2010-01-01',
        endDate: '2024-12-31',
        startingValue: 10000,
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
      },
    });
    const state = useBacktestStore.getState();
    expect(state.portfolios.length).toBe(1);
    expect(state.portfolios[0].id).toBe('portfolio-abc');
  });

  it('handles multiple portfolios with mixed id patterns', () => {
    useBacktestStore.getState().loadFromShare({
      portfolios: [
        {
          id: 'a',
          name: 'A',
          assets: [{ ticker: 'SPY', weight: 100 }],
          rebalanceFrequency: 'none',
        },
        {
          id: 'portfolio-99',
          name: 'B',
          assets: [{ ticker: 'VTI', weight: 100 }],
          rebalanceFrequency: 'none',
        },
      ],
      parameters: {
        startDate: '2010-01-01',
        endDate: '2024-12-31',
        startingValue: 10000,
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
      },
    });
    const state = useBacktestStore.getState();
    expect(state.portfolios.length).toBe(2);
    expect(state.portfolios[0].id).toBe('a');
    expect(state.portfolios[1].id).toBe('portfolio-99');
  });
});

// ===== Cashflow operations =====
describe('cashflowLeg operations', () => {
  it('addCashflowLeg adds a new cashflow leg with defaults', () => {
    useBacktestStore.getState().addCashflowLeg();
    const legs = useBacktestStore.getState().parameters.cashflowLegs;
    expect(legs).toBeDefined();
    expect(legs!.length).toBe(1);
    expect(legs![0].amount).toBe(0);
    expect(legs![0].type).toBe('contribution');
    expect(legs![0].frequency).toBe('yearly');
    expect(legs![0].id).toBeTruthy();
  });

  it('addCashflowLeg appends to existing legs', () => {
    useBacktestStore.getState().addCashflowLeg();
    useBacktestStore.getState().addCashflowLeg();
    const legs = useBacktestStore.getState().parameters.cashflowLegs;
    expect(legs!.length).toBe(2);
    expect(legs![0].id).toBeTruthy();
    expect(legs![1].id).toBeTruthy();
  });

  it('removeCashflowLeg removes by id', () => {
    useBacktestStore.getState().addCashflowLeg();
    const id = useBacktestStore.getState().parameters.cashflowLegs![0].id;
    useBacktestStore.getState().removeCashflowLeg(id);
    expect(useBacktestStore.getState().parameters.cashflowLegs!.length).toBe(0);
  });

  it('removeCashflowLeg with non-existent id does nothing', () => {
    useBacktestStore.getState().addCashflowLeg();
    useBacktestStore.getState().removeCashflowLeg('not-exist');
    expect(useBacktestStore.getState().parameters.cashflowLegs!.length).toBe(1);
  });

  it('updateCashflowLeg updates amount', () => {
    useBacktestStore.getState().addCashflowLeg();
    const id = useBacktestStore.getState().parameters.cashflowLegs![0].id;
    useBacktestStore.getState().updateCashflowLeg(id, { amount: 5000 });
    expect(useBacktestStore.getState().parameters.cashflowLegs![0].amount).toBe(5000);
  });

  it('updateCashflowLeg updates type', () => {
    useBacktestStore.getState().addCashflowLeg();
    const id = useBacktestStore.getState().parameters.cashflowLegs![0].id;
    useBacktestStore.getState().updateCashflowLeg(id, { type: 'withdrawal' });
    expect(useBacktestStore.getState().parameters.cashflowLegs![0].type).toBe('withdrawal');
  });

  it('updateCashflowLeg with non-existent id does nothing', () => {
    useBacktestStore.getState().addCashflowLeg();
    useBacktestStore.getState().updateCashflowLeg('not-exist', { amount: 999 });
    expect(useBacktestStore.getState().parameters.cashflowLegs![0].amount).toBe(0);
  });
});

// ===== One-time cashflow operations =====
describe('oneTimeCashflow operations', () => {
  it('addOneTimeCashflow adds with defaults using startDate', () => {
    useBacktestStore.getState().addOneTimeCashflow();
    const cf = useBacktestStore.getState().parameters.oneTimeCashflows;
    expect(cf).toBeDefined();
    expect(cf!.length).toBe(1);
    expect(cf![0].amount).toBe(0);
    expect(cf![0].type).toBe('contribution');
    expect(cf![0].date).toBe('2010-01-01');
    expect(cf![0].id).toBeTruthy();
  });

  it('addOneTimeCashflow appends to existing', () => {
    useBacktestStore.getState().addOneTimeCashflow();
    useBacktestStore.getState().addOneTimeCashflow();
    expect(useBacktestStore.getState().parameters.oneTimeCashflows!.length).toBe(2);
  });

  it('removeOneTimeCashflow removes by id', () => {
    useBacktestStore.getState().addOneTimeCashflow();
    const id = useBacktestStore.getState().parameters.oneTimeCashflows![0].id;
    useBacktestStore.getState().removeOneTimeCashflow(id);
    expect(useBacktestStore.getState().parameters.oneTimeCashflows!.length).toBe(0);
  });

  it('removeOneTimeCashflow with non-existent id does nothing', () => {
    useBacktestStore.getState().addOneTimeCashflow();
    useBacktestStore.getState().removeOneTimeCashflow('not-exist');
    expect(useBacktestStore.getState().parameters.oneTimeCashflows!.length).toBe(1);
  });

  it('updateOneTimeCashflow updates amount and type', () => {
    useBacktestStore.getState().addOneTimeCashflow();
    const id = useBacktestStore.getState().parameters.oneTimeCashflows![0].id;
    useBacktestStore.getState().updateOneTimeCashflow(id, { amount: 10000, type: 'withdrawal' });
    expect(useBacktestStore.getState().parameters.oneTimeCashflows![0].amount).toBe(10000);
    expect(useBacktestStore.getState().parameters.oneTimeCashflows![0].type).toBe('withdrawal');
  });

  it('updateOneTimeCashflow with non-existent id does nothing', () => {
    useBacktestStore.getState().addOneTimeCashflow();
    useBacktestStore.getState().updateOneTimeCashflow('not-exist', { amount: 999 });
    expect(useBacktestStore.getState().parameters.oneTimeCashflows![0].amount).toBe(0);
  });
});

// ===== setHasLoadedFromShare =====
describe('setHasLoadedFromShare', () => {
  it('sets the flag to true', () => {
    useBacktestStore.getState().setHasLoadedFromShare(true);
    expect(useBacktestStore.getState().hasLoadedFromShare).toBe(true);
  });

  it('sets the flag to false', () => {
    useBacktestStore.getState().setHasLoadedFromShare(false);
    expect(useBacktestStore.getState().hasLoadedFromShare).toBe(false);
  });
});

// ===== getShareableState =====
describe('getShareableState', () => {
  it('returns portfolios and parameters without other state', () => {
    const state = useBacktestStore.getState();
    const shareable = state.getShareableState();
    expect(shareable).toHaveProperty('portfolios');
    expect(shareable).toHaveProperty('parameters');
    expect(shareable).not.toHaveProperty('results');
    expect(shareable).not.toHaveProperty('isLoading');
    expect(shareable).not.toHaveProperty('activeTab');
    expect(shareable.portfolios).toEqual(state.portfolios);
    expect(shareable.parameters).toEqual(state.parameters);
  });
});
