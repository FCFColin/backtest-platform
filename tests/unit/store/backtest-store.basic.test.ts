import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('react', () => ({ startTransition: vi.fn((cb) => cb()) }));
const mockFetch = vi.fn();
global.fetch = mockFetch;
vi.mock('../../../packages/frontend/src/store/toastStore.js', () => ({
  useToastStore: { getState: () => ({ addToast: vi.fn() }) },
}));

import { extractApiErrorDetail } from '../../../packages/frontend/src/store/backtestHelpers.js';
import { useBacktestStore } from '../../../packages/frontend/src/store/backtestStore.js';
import { mockBacktestParams } from '../../helpers/storeFixtures.js';
import { resetBacktestStoreState } from '../../helpers/backtestStoreFixtures.js';

const S = () => useBacktestStore.getState();
const addLeg = () => { S().addCashflowLeg(); return S().parameters.cashflowLegs![0].id; };
const addOneTime = () => { S().addOneTimeCashflow(); return S().parameters.oneTimeCashflows![0].id; };
beforeEach(() => resetBacktestStoreState(mockFetch));

describe('addPortfolio', () => {
  it('添加新组合，包含默认VTI+BND', () => {
    S().addPortfolio('60-40');
    const p = S().portfolios[1];
    expect(S().portfolios.length).toBe(2);
    expect(p.assets[0]).toMatchObject({ ticker: 'VTI', weight: 60 });
    expect(p.assets[1]).toMatchObject({ ticker: 'BND', weight: 40 });
    expect(p.rebalanceFrequency).toBe('quarterly');
  });
});

describe('duplicatePortfolio', () => {
  it('复制存在的组合', () => {
    S().duplicatePortfolio('p1');
    const after = S().portfolios;
    expect(after.length).toBe(2);
    expect(after[1].name).toBe('Portfolio 1 (副本)');
    expect(after[1].assets).toEqual(after[0].assets);
    expect(after[1].id).not.toBe('p1');
  });
  it('复制后修改副本不影响原组合', () => {
    S().duplicatePortfolio('p1');
    S().updateAsset(S().portfolios[1].id, 0, { weight: 80 });
    expect(S().portfolios[0].assets[0].weight).toBe(60);
    expect(S().portfolios[1].assets[0].weight).toBe(80);
  });
  it('复制不存在的id，不增加组合', () => {
    S().duplicatePortfolio('not-exist');
    expect(S().portfolios.length).toBe(1);
  });
});

describe('removePortfolio', () => {
  it('只有1个组合时也能删除', () => {
    S().removePortfolio('p1');
    expect(S().portfolios.length).toBe(0);
  });
  it('有2个组合时可以删除', () => {
    S().addPortfolio();
    S().removePortfolio(S().portfolios[1].id);
    expect(S().portfolios.length).toBe(1);
    expect(S().portfolios[0].id).toBe('p1');
  });
  it('删除不存在的id无影响', () => {
    S().removePortfolio('not-exist');
    expect(S().portfolios.length).toBe(1);
  });
});

describe('addAsset', () => {
  it('添加空资产到存在的组合', () => {
    S().addAsset('p1');
    const a = S().portfolios[0].assets[2];
    expect(S().portfolios[0].assets.length).toBe(3);
    expect(a).toMatchObject({ ticker: '', weight: 0 });
    expect(a.id).toBeTruthy();
  });
  it('添加到不存在的组合无影响', () => {
    S().addAsset('not-exist');
    expect(S().portfolios[0].assets.length).toBe(2);
  });
});

describe('removeAsset', () => {
  it.each<[string, string, string, number, string | null]>([
    ['删除存在的资产', 'p1', 'VTI', 1, 'BND'],
    ['删除不存在的ticker无影响', 'p1', 'NOTEXIST', 2, null],
    ['从不存在的组合删除无影响', 'not-exist', 'VTI', 2, null],
  ])('%s', (_n, pid, ticker, len, firstTicker) => {
    S().removeAsset(pid, ticker);
    const after = S().portfolios[0];
    expect(after.assets.length).toBe(len);
    if (firstTicker) expect(after.assets[0].ticker).toBe(firstTicker);
  });
});

describe('updateAsset', () => {
  it('更新存在的资产权重', () => {
    S().updateAsset('p1', 0, { weight: 70 });
    const a = S().portfolios[0].assets;
    expect(a[0].weight).toBe(70);
    expect(a[1].weight).toBe(40);
  });
  it('更新存在的资产ticker', () => {
    S().updateAsset('p1', 0, { ticker: 'SPY' });
    expect(S().portfolios[0].assets[0].ticker).toBe('SPY');
  });
  it.each([
    ['越界index', 'p1', 99],
    ['不存在的组合', 'not-exist', 0],
  ])('更新%s无影响', (_n, pid, idx) => {
    S().updateAsset(pid, idx, { weight: 50 });
    expect(S().portfolios[0].assets[0].weight).toBe(60);
  });
});

describe('updatePortfolio', () => {
  it.each([
    ['名称', { name: '我的组合' }, 'name', '我的组合'],
    ['调仓频率', { rebalanceFrequency: 'monthly' }, 'rebalanceFrequency', 'monthly'],
  ])('更新%s', (_n, update, key, expected) => {
    S().updatePortfolio('p1', update);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((S().portfolios[0] as any)[key]).toBe(expected);
  });
  it('更新偏离调仓阈值', () => {
    S().updatePortfolio('p1', { rebalanceFrequency: 'threshold', rebalanceThreshold: 10 });
    const p = S().portfolios[0];
    expect(p.rebalanceFrequency).toBe('threshold');
    expect(p.rebalanceThreshold).toBe(10);
  });
  it('更新不存在的组合无影响', () => {
    S().updatePortfolio('not-exist', { name: '不存在' });
    expect(S().portfolios[0].name).toBe('Portfolio 1');
  });
});

describe('updateParameter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  it.each<[string, any, any]>([
    ['startingValue', 50000],
    ['startDate', '2015-01-01'],
    ['endDate', '2023-12-31'],
    ['benchmarkTicker', ''],
    ['adjustForInflation', true],
    ['rollingWindowMonths', 6],
  ])('更新%s', (key, value) => {
    S().updateParameter(key, value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((S().parameters as any)[key]).toBe(value);
  });
});

describe('addGlidepath', () => {
  it.each([
    ['non-existent', 'p1'],
    ['p1', 'non-existent'],
    ['x', 'y'],
  ])('does not add when from=%s or to=%s portfolio not found', (from, to) => {
    const before = S().portfolios.length;
    S().addGlidepath('Glidepath', from, to, 5);
    expect(S().portfolios.length).toBe(before);
  });
  it('creates glidepath when both portfolios exist', () => {
    S().addPortfolio();
    const before = S().portfolios.length;
    const [p1Id, p2Id] = [S().portfolios[0].id, S().portfolios[1].id];
    S().addGlidepath('My Glidepath', p1Id, p2Id, 10);
    expect(S().portfolios.length).toBe(before + 1);
    const gp = S().portfolios[2];
    expect(gp).toMatchObject({ isGlidepath: true, name: 'My Glidepath', glidepathFrom: p1Id, glidepathTo: p2Id, glidepathYears: 10 });
    expect(gp.assets).toEqual(S().portfolios[0].assets);
  });
});

describe('batchUpdateAssets', () => {
  it.each([
    ['matching indices', 'p1', [{ index: 0, weight: 50 }, { index: 1, weight: 50 }], [50, 50]],
    ['non-matching portfolioId', 'non-existent', [{ index: 0, weight: 100 }], [60, 40]],
    ['skip non-existent indices', 'p1', [{ index: 0, weight: 80 }, { index: 99, weight: 20 }], [80, 40]],
  ])('updates %s', (_n, pid, updates, [w0, w1]) => {
    S().batchUpdateAssets(pid, updates);
    const a = S().portfolios[0].assets;
    expect(a[0].weight).toBe(w0);
    expect(a[1].weight).toBe(w1);
  });
});

describe('loadFromShare', () => {
  it('从分享数据加载，覆盖现有状态', () => {
    S().loadFromShare({
      portfolios: [{ id: 'shared-1', name: '分享组合', assets: [{ ticker: 'SPY', weight: 100 }], rebalanceFrequency: 'annual' }],
      parameters: mockBacktestParams({ startDate: '2015-01-01', startingValue: 20000, benchmarkTicker: '' }),
    });
    const state = S();
    expect(state.portfolios.length).toBe(1);
    expect(state.portfolios[0].name).toBe('分享组合');
    expect(state.portfolios[0].assets[0].ticker).toBe('SPY');
    expect(state.parameters.startingValue).toBe(20000);
    expect(state.results).toBeNull();
  });
  it('分享数据中无id时自动生成', () => {
    S().loadFromShare({
      portfolios: [{ name: '无ID组合', assets: [{ ticker: 'VTI', weight: 100 }], rebalanceFrequency: 'none' } as any],
      parameters: mockBacktestParams({ benchmarkTicker: '' }),
    });
    expect(S().portfolios[0].id).toBeTruthy();
  });
});

describe('extractApiErrorDetail', () => {
  it.each<[string, unknown, string]>([
    ['returns detail field when present', { detail: 'invalid ticker' }, 'invalid ticker'],
    ['detail takes priority over error field', { detail: 'priority', error: 'ignored' }, 'priority'],
    ['returns error string when detail absent', { error: 'something went wrong' }, 'something went wrong'],
    ['returns nested error.detail when error is object with detail', { error: { detail: 'nested detail' } }, 'nested detail'],
  ])('%s', (_n, input, expected) => {
    expect(extractApiErrorDetail(input)).toBe(expected);
  });
  it.each<[string, unknown]>([
    ['returns default for null', null],
    ['returns default for undefined', undefined],
    ['returns default for primitive string', 'hello'],
    ['returns default for number', 42],
    ['returns default for empty object', {}],
  ])('%s', (_n, input) => {
    const result = extractApiErrorDetail(input);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('loadFromShare - edge cases', () => {
  it.each<[string, { id: string; name: string; rebalanceFrequency: string }[], string[]]>([
    ['handles portfolio id with no numeric suffix', [{ id: 'custom-portfolio', name: 'Custom', rebalanceFrequency: 'none' }], ['custom-portfolio']],
    ['handles portfolio id ending with non-numeric suffix', [{ id: 'portfolio-abc', name: 'Alpha', rebalanceFrequency: 'monthly' }], ['portfolio-abc']],
    ['handles multiple portfolios with mixed id patterns', [{ id: 'a', name: 'A', rebalanceFrequency: 'none' }, { id: 'portfolio-99', name: 'B', rebalanceFrequency: 'none' }], ['a', 'portfolio-99']],
  ])('%s', (_n, portfolios, expectedIds) => {
    const mapped = portfolios.map((p) => ({ ...p, assets: [{ ticker: 'SPY', weight: 100 }] })) as any;
    S().loadFromShare({ portfolios: mapped, parameters: mockBacktestParams({ benchmarkTicker: '' }) });
    const state = S();
    expect(state.portfolios.length).toBe(expectedIds.length);
    expectedIds.forEach((id, i) => expect(state.portfolios[i].id).toBe(id));
  });
});

describe('cashflowLeg operations', () => {
  it('addCashflowLeg adds with defaults', () => {
    S().addCashflowLeg();
    const leg = S().parameters.cashflowLegs![0];
    expect(leg).toMatchObject({ amount: 0, type: 'contribution', frequency: 'yearly' });
    expect(leg.id).toBeTruthy();
  });
  it('addCashflowLeg appends to existing', () => {
    S().addCashflowLeg();
    S().addCashflowLeg();
    expect(S().parameters.cashflowLegs!.length).toBe(2);
  });
  it.each<[string, boolean]>([
    ['removes by id', true],
    ['non-existent id does nothing', false],
  ])('removeCashflowLeg %s', (_n, useRealId) => {
    S().addCashflowLeg();
    S().removeCashflowLeg(useRealId ? S().parameters.cashflowLegs![0].id : 'not-exist');
    expect(S().parameters.cashflowLegs!.length).toBe(useRealId ? 0 : 1);
  });
  it.each([
    ['amount', { amount: 5000 }, 'amount', 5000],
    ['amount=0', { amount: 0 }, 'amount', 0],
    ['negative amount', { amount: -100 }, 'amount', -100],
    ['type', { type: 'withdrawal' }, 'type', 'withdrawal'],
  ])('updateCashflowLeg updates %s', (_n, update, key, expected) => {
    const id = addLeg();
    S().updateCashflowLeg(id, update);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((S().parameters.cashflowLegs![0] as any)[key]).toBe(expected);
  });
  it('updateCashflowLeg with non-existent id does nothing', () => {
    S().addCashflowLeg();
    S().updateCashflowLeg('not-exist', { amount: 999 });
    expect(S().parameters.cashflowLegs![0].amount).toBe(0);
  });
});

describe('oneTimeCashflow operations', () => {
  it('addOneTimeCashflow adds with defaults', () => {
    S().addOneTimeCashflow();
    const cf = S().parameters.oneTimeCashflows![0];
    expect(cf).toMatchObject({ amount: 0, type: 'contribution', date: '2010-01-01' });
    expect(cf.id).toBeTruthy();
  });
  it('addOneTimeCashflow appends to existing', () => {
    S().addOneTimeCashflow();
    S().addOneTimeCashflow();
    expect(S().parameters.oneTimeCashflows!.length).toBe(2);
  });
  it.each<[string, boolean]>([
    ['removes by id', true],
    ['non-existent id does nothing', false],
  ])('removeOneTimeCashflow %s', (_n, useRealId) => {
    S().addOneTimeCashflow();
    S().removeOneTimeCashflow(useRealId ? S().parameters.oneTimeCashflows![0].id : 'not-exist');
    expect(S().parameters.oneTimeCashflows!.length).toBe(useRealId ? 0 : 1);
  });
  it('updateOneTimeCashflow updates amount and type', () => {
    const id = addOneTime();
    S().updateOneTimeCashflow(id, { amount: 10000, type: 'withdrawal' });
    const cf = S().parameters.oneTimeCashflows![0];
    expect(cf.amount).toBe(10000);
    expect(cf.type).toBe('withdrawal');
  });
  it('updateOneTimeCashflow with non-existent id does nothing', () => {
    S().addOneTimeCashflow();
    S().updateOneTimeCashflow('not-exist', { amount: 999 });
    expect(S().parameters.oneTimeCashflows![0].amount).toBe(0);
  });
});

describe('setHasLoadedFromShare', () => {
  it.each([true, false])('sets the flag to %s', (flag) => {
    S().setHasLoadedFromShare(flag);
    expect(S().hasLoadedFromShare).toBe(flag);
  });
});

describe('getShareableState', () => {
  it('returns portfolios and parameters without other state', () => {
    const state = S();
    const shareable = state.getShareableState();
    expect(shareable).toHaveProperty('portfolios');
    expect(shareable).toHaveProperty('parameters');
    ['results', 'isLoading', 'activeTab'].forEach((k) => expect(shareable).not.toHaveProperty(k));
    expect(shareable.portfolios).toEqual(state.portfolios);
    expect(shareable.parameters).toEqual(state.parameters);
  });
});