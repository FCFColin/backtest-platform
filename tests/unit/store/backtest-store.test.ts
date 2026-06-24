import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBacktestStore } from '../../../src/store/backtestStore.js';

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

beforeEach(() => {
  mockFetch.mockReset();
  useBacktestStore.getState().loadFromShare({
    portfolios: [{
      id: 'p1',
      name: 'Portfolio 1',
      assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }],
      rebalanceFrequency: 'quarterly',
    }],
    parameters: {
      startDate: '2010-01-01', endDate: '2024-12-31', startingValue: 10000,
      adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: 'SPY',
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
    useBacktestStore.getState().updatePortfolio('p1', { rebalanceFrequency: 'threshold', rebalanceThreshold: 10 });
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
      portfolios: [{
        id: 'shared-1',
        name: '分享组合',
        assets: [{ ticker: 'SPY', weight: 100 }],
        rebalanceFrequency: 'annual',
      }],
      parameters: {
        startDate: '2015-01-01', endDate: '2024-12-31', startingValue: 20000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
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
      portfolios: [{
        name: '无ID组合',
        assets: [{ ticker: 'VTI', weight: 100 }],
        rebalanceFrequency: 'none',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any],
      parameters: {
        startDate: '2010-01-01', endDate: '2024-12-31', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
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
        portfolios: [{
          name: 'Test',
          growthCurve: [{ date: '2020-01-02', value: 10000 }],
          drawdownCurve: [{ date: '2020-01-02', drawdown: 0 }],
          statistics: { cagr: 0.069, stdev: 0.12, sharpe: 0.47, sortino: 0.6, maxDrawdown: 0.228, maxDrawdownDuration: 8, mwrr: 0.07, bestYear: 0.15, worstYear: -0.05, avgYear: 0.07 },
          annualReturns: [],
          monthlyReturns: [],
        }],
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
        portfolios: [{
          name: 'Test',
          growthCurve: [{ date: '2020-01-02', value: 10000 }],
          drawdownCurve: [{ date: '2020-01-02', drawdown: 0 }],
          statistics: { cagr: 0.069, stdev: 0.12, sharpe: 0.47, sortino: 0.6, maxDrawdown: 0.228, maxDrawdownDuration: 8, mwrr: 0.07, bestYear: 0.15, worstYear: -0.05, avgYear: 0.07 },
          annualReturns: [],
          monthlyReturns: [],
        }],
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
        portfolios: [{
          name: 'Test',
          growthCurve: [{ date: '2020-01-02', value: 10000 }],
          drawdownCurve: [{ date: '2020-01-02', drawdown: 0 }],
          statistics: { cagr: 0.069, stdev: 0.12, sharpe: 0.47, sortino: 0.6, maxDrawdown: 0.228, maxDrawdownDuration: 8, mwrr: 0.07, bestYear: 0.15, worstYear: -0.05, avgYear: 0.07 },
          annualReturns: [],
          monthlyReturns: [],
        }],
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
      portfolios: [{
        name: 'Test',
        growthCurve: [],
        drawdownCurve: [],
        statistics: { cagr: 0, stdev: 0, sharpe: 0, sortino: 0, maxDrawdown: 0, maxDrawdownDuration: 0, mwrr: 0, bestYear: 0, worstYear: 0, avgYear: 0 },
        annualReturns: [],
        monthlyReturns: [],
      }],
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
    useBacktestStore.getState().updatePortfolio('p1', { rebalanceFrequency: 'threshold', rebalanceThreshold: 8 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { portfolios: [], correlations: [], benchmarkGrowth: [] },
      }),
    });

    await useBacktestStore.getState().runBacktest();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.portfolios[0].rebalanceFrequency).toBe('threshold');
    expect(body.portfolios[0].rebalanceThreshold).toBe(8);
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
