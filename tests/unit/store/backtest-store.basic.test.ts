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

import { useBacktestStore } from '../../../packages/frontend/src/store/backtestStore.js';
import { mockPortfolio, mockBacktestParams } from '../../helpers/storeFixtures.js';

beforeEach(() => {
  mockFetch.mockReset();
  useBacktestStore.getState().loadFromShare({
    portfolios: [mockPortfolio()],
    parameters: mockBacktestParams(),
  });
});

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
