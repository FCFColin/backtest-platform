/**
 * backtestStore 基础操作单元测试（合并自 basic + basic.share 2 文件）
 *
 * 覆盖：
 * - 组合 CRUD：addPortfolio/duplicatePortfolio/removePortfolio/addAsset/removeAsset/updateAsset
 * - 参数更新：updatePortfolio/updateParameter/addGlidepath/batchUpdateAssets
 * - 分享数据：loadFromShare/extractApiErrorDetail/getShareableState/setHasLoadedFromShare
 * - 现金流：cashflowLeg/oneTimeCashflow 增删改
 *
 * Mock 策略：react startTransition + fetch + toastStore（vi.mock 必须留在文件顶部），
 * 共享状态重置与 fetch helper 见 tests/helpers/backtestStoreFixtures.ts。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', () => ({ startTransition: vi.fn((cb) => cb()) }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../../packages/frontend/src/store/toastStore.js', () => ({
  useToastStore: {
    getState: () => ({ addToast: vi.fn() }),
  },
}));

import { extractApiErrorDetail } from '../../../packages/frontend/src/store/backtestHelpers.js';
import { useBacktestStore } from '../../../packages/frontend/src/store/backtestStore.js';
import { mockBacktestParams } from '../../helpers/storeFixtures.js';
import { resetBacktestStoreState } from '../../helpers/backtestStoreFixtures.js';

beforeEach(() => resetBacktestStoreState(mockFetch));

describe('addPortfolio', () => {
  it('添加新组合，包含默认VTI+BND', () => {
    useBacktestStore.getState().addPortfolio('60-40');
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
  it('只有1个组合时也能删除', () => {
    useBacktestStore.getState().removePortfolio('p1');
    expect(useBacktestStore.getState().portfolios.length).toBe(0);
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
  const cases = [
    { name: '更新startingValue', key: 'startingValue', value: 50000 },
    { name: '更新startDate', key: 'startDate', value: '2015-01-01' },
    { name: '更新endDate', key: 'endDate', value: '2023-12-31' },
    { name: '更新benchmarkTicker', key: 'benchmarkTicker', value: '' },
    { name: '更新adjustForInflation', key: 'adjustForInflation', value: true },
    { name: '更新rollingWindowMonths', key: 'rollingWindowMonths', value: 6 },
  ] as const;

  for (const tc of cases) {
    it(tc.name, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useBacktestStore.getState().updateParameter(tc.key as any, tc.value as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((useBacktestStore.getState().parameters as any)[tc.key]).toBe(tc.value);
    });
  }
});

describe('addGlidepath', () => {
  it.each([
    ['non-existent', 'p1'],
    ['p1', 'non-existent'],
    ['x', 'y'],
  ])('does not add when from=%s or to=%s portfolio not found', (from, to) => {
    const before = useBacktestStore.getState().portfolios.length;
    useBacktestStore.getState().addGlidepath('Glidepath', from, to, 5);
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

// ============================================================
// 分享数据加载与序列化（原 basic.share.test.ts）
// ============================================================

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
      parameters: mockBacktestParams({
        startDate: '2015-01-01',
        startingValue: 20000,
        benchmarkTicker: '',
      }),
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
      parameters: mockBacktestParams({ benchmarkTicker: '' }),
    });
    const state = useBacktestStore.getState();
    expect(state.portfolios[0].id).toBeTruthy();
  });
});

describe('extractApiErrorDetail', () => {
  it.each<[string, unknown, string]>([
    ['returns detail field when present', { detail: 'invalid ticker' }, 'invalid ticker'],
    ['detail takes priority over error field', { detail: 'priority', error: 'ignored' }, 'priority'],
    ['returns error string when detail absent', { error: 'something went wrong' }, 'something went wrong'],
    [
      'returns nested error.detail when error is object with detail',
      { error: { detail: 'nested detail' } },
      'nested detail',
    ],
  ])('%s', (_name, input, expected) => {
    expect(extractApiErrorDetail(input)).toBe(expected);
  });

  it.each<[string, unknown]>([
    ['returns default for null', null],
    ['returns default for undefined', undefined],
    ['returns default for primitive string', 'hello'],
    ['returns default for number', 42],
    ['returns default for empty object', {}],
  ])('%s', (_name, input) => {
    const result = extractApiErrorDetail(input);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('loadFromShare - edge cases', () => {
  it.each<[string, { id: string; name: string; rebalanceFrequency: string }[], string[]]>([
    [
      'handles portfolio id with no numeric suffix',
      [{ id: 'custom-portfolio', name: 'Custom', rebalanceFrequency: 'none' }],
      ['custom-portfolio'],
    ],
    [
      'handles portfolio id ending with non-numeric suffix',
      [{ id: 'portfolio-abc', name: 'Alpha', rebalanceFrequency: 'monthly' }],
      ['portfolio-abc'],
    ],
    [
      'handles multiple portfolios with mixed id patterns',
      [
        { id: 'a', name: 'A', rebalanceFrequency: 'none' },
        { id: 'portfolio-99', name: 'B', rebalanceFrequency: 'none' },
      ],
      ['a', 'portfolio-99'],
    ],
  ])('%s', (_name, portfolios, expectedIds) => {
     
    const mapped = portfolios.map((p) => ({
      ...p,
      assets: [{ ticker: 'SPY', weight: 100 }],
    })) as unknown as Portfolio[];
    useBacktestStore.getState().loadFromShare({
      portfolios: mapped,
      parameters: mockBacktestParams({ benchmarkTicker: '' }),
    });
    const state = useBacktestStore.getState();
    expect(state.portfolios.length).toBe(expectedIds.length);
    expectedIds.forEach((id, i) => {
      expect(state.portfolios[i].id).toBe(id);
    });
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

  it('updateCashflowLeg accepts amount=0 (relaxed schema, no-op leg)', () => {
    useBacktestStore.getState().addCashflowLeg();
    const id = useBacktestStore.getState().parameters.cashflowLegs![0].id;
    useBacktestStore.getState().updateCashflowLeg(id, { amount: 0 });
    expect(useBacktestStore.getState().parameters.cashflowLegs![0].amount).toBe(0);
  });

  it('updateCashflowLeg accepts negative amount (net outflow override)', () => {
    useBacktestStore.getState().addCashflowLeg();
    const id = useBacktestStore.getState().parameters.cashflowLegs![0].id;
    useBacktestStore.getState().updateCashflowLeg(id, { amount: -100 });
    expect(useBacktestStore.getState().parameters.cashflowLegs![0].amount).toBe(-100);
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
  it.each([true, false])('sets the flag to %s', (flag) => {
    useBacktestStore.getState().setHasLoadedFromShare(flag);
    expect(useBacktestStore.getState().hasLoadedFromShare).toBe(flag);
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
