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

import { extractApiErrorDetail } from '../../../packages/frontend/src/store/backtestHelpers.js';
import { useBacktestStore } from '../../../packages/frontend/src/store/backtestStore.js';
import { mockPortfolio, mockBacktestParams } from '../../helpers/storeFixtures.js';

beforeEach(() => {
  mockFetch.mockReset();
  useBacktestStore.getState().loadFromShare({
    portfolios: [mockPortfolio()],
    parameters: mockBacktestParams(),
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
  const cases: Array<{
    name: string;
    input: unknown;
    expected?: string;
    expectDefault?: boolean;
  }> = [
    {
      name: 'returns detail field when present',
      input: { detail: 'invalid ticker' },
      expected: 'invalid ticker',
    },
    {
      name: 'detail takes priority over error field',
      input: { detail: 'priority', error: 'ignored' },
      expected: 'priority',
    },
    {
      name: 'returns error string when detail absent',
      input: { error: 'something went wrong' },
      expected: 'something went wrong',
    },
    {
      name: 'returns nested error.detail when error is object with detail',
      input: { error: { detail: 'nested detail' } },
      expected: 'nested detail',
    },
    { name: 'returns default for null', input: null, expectDefault: true },
    { name: 'returns default for undefined', input: undefined, expectDefault: true },
    { name: 'returns default for primitive string', input: 'hello', expectDefault: true },
    { name: 'returns default for number', input: 42, expectDefault: true },
    { name: 'returns default for empty object', input: {}, expectDefault: true },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      const result = extractApiErrorDetail(tc.input);
      if (tc.expectDefault) {
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      } else {
        expect(result).toBe(tc.expected);
      }
    });
  }
});

describe('loadFromShare - edge cases', () => {
  const cases: Array<{
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    portfolios: any[];
    expectedIds: string[];
  }> = [
    {
      name: 'handles portfolio id with no numeric suffix',
      portfolios: [
        {
          id: 'custom-portfolio',
          name: 'Custom',
          assets: [{ ticker: 'SPY', weight: 100 }],
          rebalanceFrequency: 'none',
        },
      ],
      expectedIds: ['custom-portfolio'],
    },
    {
      name: 'handles portfolio id ending with non-numeric suffix',
      portfolios: [
        {
          id: 'portfolio-abc',
          name: 'Alpha',
          assets: [{ ticker: 'BND', weight: 100 }],
          rebalanceFrequency: 'monthly',
        },
      ],
      expectedIds: ['portfolio-abc'],
    },
    {
      name: 'handles multiple portfolios with mixed id patterns',
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
      expectedIds: ['a', 'portfolio-99'],
    },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      useBacktestStore.getState().loadFromShare({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        portfolios: tc.portfolios as any,
        parameters: mockBacktestParams({ benchmarkTicker: '' }),
      });
      const state = useBacktestStore.getState();
      expect(state.portfolios.length).toBe(tc.expectedIds.length);
      tc.expectedIds.forEach((id, i) => {
        expect(state.portfolios[i].id).toBe(id);
      });
    });
  }
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
