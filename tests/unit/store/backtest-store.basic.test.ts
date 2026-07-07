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

import { extractApiErrorDetail } from '../../../packages/frontend/src/store/utils/backtestHelpers.js';
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
    expect(after[0].assets[0].weight).toBe(60);
    expect(after[1].assets[0].weight).toBe(80);
  });
});

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

describe('updateAsset', () => {
  it('更新存在的资产权重', () => {
    useBacktestStore.getState().updateAsset('p1', 0, { weight: 70 });
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets[0].weight).toBe(70);
    expect(after.assets[1].weight).toBe(40);
  });

  it('更新存在的资产ticker', () => {
    useBacktestStore.getState().updateAsset('p1', 0, { ticker: 'SPY' });
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets[0].ticker).toBe('SPY');
  });

  it('更新越界index无影响', () => {
    useBacktestStore.getState().updateAsset('p1', 99, { weight: 50 });
    const after = useBacktestStore.getState().portfolios[0];
    expect(after.assets[0].weight).toBe(60);
  });

  it('更新不存在的组合无影响', () => {
    useBacktestStore.getState().updateAsset('not-exist', 0, { weight: 50 });
    expect(useBacktestStore.getState().portfolios[0].assets[0].weight).toBe(60);
  });
});

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
