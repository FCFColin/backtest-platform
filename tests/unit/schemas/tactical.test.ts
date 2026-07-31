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

import { describe, it, expect } from 'vitest';
import { tacticalGridSearchSchema } from '../../../packages/backend/src/schemas/tactical.js';

function makeValidInput() {
  return {
    indicator: 'sma',
    param1: { min: 5, max: 50, step: 5 },
    param2: { min: 10, max: 100, step: 10 },
    tickers: ['AAPL', 'MSFT'],
    startDate: '2020-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    rebalanceFrequency: 'monthly',
    objective: 'maxCAGR',
  };
}

describe('tacticalGridSearchSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => tacticalGridSearchSchema.parse(makeValidInput())).not.toThrow();
  });

  it.each([
    [
      'indicator 非法枚举',
      (d: Record<string, unknown>) => {
        d.indicator = 'invalid';
      },
    ],
    [
      'param1.step 为 0',
      (d: Record<string, unknown>) => {
        (d.param1 as Record<string, unknown>).step = 0;
      },
    ],
    [
      'param1.step 为负数',
      (d: Record<string, unknown>) => {
        (d.param1 as Record<string, unknown>).step = -1;
      },
    ],
    [
      'param2.step 为 0',
      (d: Record<string, unknown>) => {
        (d.param2 as Record<string, unknown>).step = 0;
      },
    ],
    [
      'param2.step 为负数',
      (d: Record<string, unknown>) => {
        (d.param2 as Record<string, unknown>).step = -5;
      },
    ],
    [
      '缺少 param1',
      (d: Record<string, unknown>) => {
        delete d.param1;
      },
    ],
    [
      '缺少 param2',
      (d: Record<string, unknown>) => {
        delete d.param2;
      },
    ],
    [
      'tickers 为空数组',
      (d: Record<string, unknown>) => {
        d.tickers = [];
      },
    ],
    [
      '缺少 tickers',
      (d: Record<string, unknown>) => {
        delete d.tickers;
      },
    ],
    [
      'startDate 为空字符串',
      (d: Record<string, unknown>) => {
        d.startDate = '';
      },
    ],
    [
      'startDate 非日期格式',
      (d: Record<string, unknown>) => {
        d.startDate = 'not-a-date';
      },
    ],
    [
      'endDate 非日期格式',
      (d: Record<string, unknown>) => {
        d.endDate = '2024/12/31';
      },
    ],
    [
      'startingValue 为 0',
      (d: Record<string, unknown>) => {
        d.startingValue = 0;
      },
    ],
    [
      'startingValue 为负数',
      (d: Record<string, unknown>) => {
        d.startingValue = -100;
      },
    ],
    [
      'rebalanceFrequency 非法枚举',
      (d: Record<string, unknown>) => {
        d.rebalanceFrequency = 'invalid';
      },
    ],
    [
      'objective 非法枚举',
      (d: Record<string, unknown>) => {
        d.objective = 'invalid';
      },
    ],
    [
      'topN 为 0',
      (d: Record<string, unknown>) => {
        d.topN = 0;
      },
    ],
    [
      'topN 为小数（int 约束）',
      (d: Record<string, unknown>) => {
        d.topN = 1.5;
      },
    ],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it.each([
    [
      'indicator=ema',
      (d: Record<string, unknown>) => {
        d.indicator = 'ema';
      },
    ],
    [
      'indicator=rsi',
      (d: Record<string, unknown>) => {
        d.indicator = 'rsi';
      },
    ],
    [
      'objective=minDrawdown',
      (d: Record<string, unknown>) => {
        d.objective = 'minDrawdown';
      },
    ],
    [
      'objective=maxSharpe',
      (d: Record<string, unknown>) => {
        d.objective = 'maxSharpe';
      },
    ],
    [
      'topN 可选字段合法正整数',
      (d: Record<string, unknown>) => {
        d.topN = 5;
      },
    ],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => tacticalGridSearchSchema.parse(data)).not.toThrow();
  });
});
