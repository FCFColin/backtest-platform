import { describe, it, expect } from 'vitest';
import {
  tacticalBacktestSchema,
  tacticalWhatIfSchema,
} from '../../../packages/backend/src/schemas/tactical.js';

function makeValidCondition() {
  return { indicator: 'sma', period: 20, operator: 'gt', threshold: 0 };
}

function makeValidTradingSignal() {
  return {
    id: 'sig-1',
    name: 'Golden Cross',
    conditions: [makeValidCondition()],
    targetWeights: [{ ticker: 'SPY', weight: 100 }],
  };
}

function makeValidStrategy() {
  return {
    id: 'strat-1',
    name: 'Momentum Strategy',
    signals: [makeValidTradingSignal()],
    aggregationMethod: 'weighted_average',
  };
}

function makeValidBacktest() {
  return {
    strategy: makeValidStrategy(),
    startDate: '2020-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    rebalanceFrequency: 'monthly',
  };
}

type Mutator = (d: Record<string, unknown>) => void;

describe('tacticalBacktestSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => tacticalBacktestSchema.parse(makeValidBacktest())).not.toThrow();
  });

  it('rankingConfig 可选字段应通过校验', () => {
    const data = makeValidBacktest();
    (data.strategy as Record<string, unknown>).rankingConfig = { method: 'fixed_share', topN: 3 };
    expect(() => tacticalBacktestSchema.parse(data)).not.toThrow();
  });

  it.each<Mutator>([
    (d) => {
      delete d.strategy;
    },
    (d) => {
      (d.strategy as Record<string, unknown>).id = '';
    },
    (d) => {
      (d.strategy as Record<string, unknown>).signals = [];
    },
    (d) => {
      ((d.strategy as Record<string, unknown>).signals as Record<string, unknown>[])[0].conditions =
        [];
    },
    (d) => {
      (
        ((d.strategy as Record<string, unknown>).signals as Record<string, unknown>[])[0]
          .conditions as Record<string, unknown>[]
      )[0].indicator = 'invalid';
    },
    (d) => {
      (
        ((d.strategy as Record<string, unknown>).signals as Record<string, unknown>[])[0]
          .conditions as Record<string, unknown>[]
      )[0].operator = 'invalid';
    },
    (d) => {
      (d.strategy as Record<string, unknown>).aggregationMethod = 'invalid';
    },
    (d) => {
      d.startingValue = 0;
    },
    (d) => {
      d.startingValue = -100;
    },
    (d) => {
      d.rebalanceFrequency = 'invalid';
    },
    (d) => {
      (
        (d.strategy as Record<string, unknown>).signals as Record<string, unknown>[]
      )[0].targetWeights = [];
    },
  ])('非法字段应抛错 %#', (mutate) => {
    const data = makeValidBacktest();
    mutate(data);
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });
});

describe('tacticalWhatIfSchema', () => {
  it.each([
    ['仅 tickers', { tickers: ['AAPL', 'MSFT'] }],
    ['strategy 可选', { tickers: ['AAPL'], strategy: makeValidStrategy() }],
    ['endDate 合法', { tickers: ['AAPL'], endDate: '2024-12-31' }],
  ])('合法输入（%s）应通过校验', (_n, data) => {
    expect(() => tacticalWhatIfSchema.parse(data)).not.toThrow();
  });

  it.each([
    ['tickers 为空数组', { tickers: [] }],
    ['endDate 非日期', { tickers: ['AAPL'], endDate: 'not-a-date' }],
  ])('%s 应抛错', (_n, data) => {
    expect(() => tacticalWhatIfSchema.parse(data)).toThrow();
  });

  it('缺少 tickers 应抛错', () => {
    expect(() => tacticalWhatIfSchema.parse({})).toThrow();
  });
});
