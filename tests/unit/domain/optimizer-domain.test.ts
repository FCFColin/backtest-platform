import { describe, it, expect } from 'vitest';
import {
  MAX_OPTIMIZER_COMBINATIONS,
  range,
  buildBacktestParameters,
  validateOptimizeRequest,
  buildCombinations,
  filterByConstraints,
  objectiveValue,
  type OptimizeResultItem,
} from '../../../packages/backend/src/domain/services/optimizer-domain.js';
import type { BacktestOptimizerRequest } from '../../../packages/backend/src/schemas/backtest.js';
import {
  validateGridSearchRequest,
  countCombinations,
  type GridSearchDomainRequest,
} from '../../../packages/backend/src/domain/services/grid-search.js';

function validRequest(overrides: Partial<BacktestOptimizerRequest> = {}): BacktestOptimizerRequest {
  return {
    portfolio: { assets: [{ ticker: 'VTI', weight: 100 }] },
    parameterSpace: {
      rebalanceFrequencies: ['monthly', 'quarterly'],
      initialCapital: { min: 10000, max: 20000, step: 10000 },
    },
    parameters: {
      startDate: '2020-01-01',
      endDate: '2024-12-31',
    },
    objective: 'maxSharpe',
    ...overrides,
  };
}

function makeItem(overrides: Partial<OptimizeResultItem> = {}): OptimizeResultItem {
  return {
    rebalanceFrequency: 'monthly',
    initialCapital: 10000,
    cagr: 0.08,
    maxDrawdown: 0.15,
    sharpe: 0.6,
    sortino: 0.8,
    stdev: 0.12,
    calmar: 0.53,
    ...overrides,
  };
}

describe('range', () => {
  it.each([
    ['正步长生成等差数列', [1, 5, 1], [1, 2, 3, 4, 5]],
    ['步长为 2 时跳过中间值', [0, 10, 2], [0, 2, 4, 6, 8, 10]],
    ['min === max 时返回单元素', [5, 5, 1], [5]],
    ['浮点步长保留两位小数', [0, 0.03, 0.01], [0, 0.01, 0.02, 0.03]],
  ])('%s', (_n, [min, max, step], expected) => {
    expect(range(min, max, step)).toEqual(expected);
  });
});

describe('buildBacktestParameters', () => {
  it('补齐默认值', () => {
    const params = buildBacktestParameters(
      { startDate: '2020-01-01', endDate: '2024-12-31' },
      50000,
    );
    expect(params.startingValue).toBe(50000);
    expect(params.baseCurrency).toBe('usd');
    expect(params.adjustForInflation).toBe(false);
    expect(params.rollingWindowMonths).toBe(12);
    expect(params.benchmarkTicker).toBe('');
    expect(params.cashflowLegs).toEqual([]);
    expect(params.oneTimeCashflows).toEqual([]);
  });

  it('保留显式传入的可选字段', () => {
    const params = buildBacktestParameters(
      {
        startDate: '2020-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'cny',
        adjustForInflation: true,
        benchmarkTicker: '000300.SH',
      },
      10000,
    );
    expect(params.baseCurrency).toBe('cny');
    expect(params.adjustForInflation).toBe(true);
    expect(params.benchmarkTicker).toBe('000300.SH');
  });
});

describe('validateOptimizeRequest', () => {
  it('有效请求返回 null', () => {
    expect(validateOptimizeRequest(validRequest())).toBeNull();
  });

  it.each([
    ['缺少 portfolio.assets 返回错误', { portfolio: { assets: [] } }, 'portfolio.assets'],
    [
      '缺少 rebalanceFrequencies 返回错误',
      {
        parameterSpace: {
          rebalanceFrequencies: [],
          initialCapital: { min: 10000, max: 20000, step: 10000 },
        },
      },
      '再平衡频率',
    ],
    ['缺少日期范围返回错误', { parameters: { startDate: '', endDate: '' } }, '日期'],
  ])('%s', (_n, overrides, fragment) => {
    expect(validateOptimizeRequest(validRequest(overrides))).toContain(fragment);
  });
});

describe('buildCombinations', () => {
  it('频率 × 资金 笛卡尔积', () => {
    const combos = buildCombinations({
      rebalanceFrequencies: ['monthly', 'quarterly'],
      initialCapital: { min: 10000, max: 20000, step: 10000 },
    });
    expect(combos).toHaveLength(4);
    expect(combos[0]).toEqual({ frequency: 'monthly', capital: 10000 });
    expect(combos[1]).toEqual({ frequency: 'monthly', capital: 20000 });
    expect(combos[2]).toEqual({ frequency: 'quarterly', capital: 10000 });
    expect(combos[3]).toEqual({ frequency: 'quarterly', capital: 20000 });
  });

  it('含阈值时追加 threshold 类型组合', () => {
    const combos = buildCombinations({
      rebalanceFrequencies: ['monthly'],
      rebalanceThreshold: { min: 5, max: 10, step: 5 },
      initialCapital: { min: 10000, max: 10000, step: 10000 },
    });
    expect(combos).toHaveLength(3);
    expect(combos[0]).toEqual({ frequency: 'monthly', capital: 10000 });
    expect(combos[1]).toEqual({ frequency: 'threshold', threshold: 5, capital: 10000 });
    expect(combos[2]).toEqual({ frequency: 'threshold', threshold: 10, capital: 10000 });
  });

  it('单一频率和资金时返回单组合', () => {
    const combos = buildCombinations({
      rebalanceFrequencies: ['none'],
      initialCapital: { min: 5000, max: 5000, step: 1000 },
    });
    expect(combos).toHaveLength(1);
    expect(combos[0]).toEqual({ frequency: 'none', capital: 5000 });
  });
});

describe('filterByConstraints', () => {
  const items = [
    makeItem({ cagr: 0.05, maxDrawdown: 0.1 }),
    makeItem({ cagr: 0.12, maxDrawdown: 0.25 }),
    makeItem({ cagr: 0.08, maxDrawdown: 0.15 }),
  ];

  it.each([
    ['无约束时返回全部', {}, 3],
    ['maxDrawdown 约束过滤超出项', { maxDrawdown: 20 }, 2],
    ['minCagr 约束过滤低于项', { minCagr: 8 }, 2],
    ['同时约束时取交集', { maxDrawdown: 20, minCagr: 8 }, 1],
  ])('%s', (_n, constraints, len) => {
    const filtered = filterByConstraints(items, constraints as never);
    expect(filtered).toHaveLength(len);
  });

  it('maxDrawdown 过滤后全部 <= 0.2', () => {
    const filtered = filterByConstraints(items, { maxDrawdown: 20 });
    expect(filtered.every((it) => it.maxDrawdown <= 0.2)).toBe(true);
  });
});

describe('objectiveValue', () => {
  const item = makeItem({ cagr: 0.1, maxDrawdown: 0.2, sharpe: 1.5, sortino: 2.0 });

  it.each<[string, string, number]>([
    ['maxCagr 返回 cagr', 'maxCagr', 0.1],
    ['minMaxDrawdown 返回负的 maxDrawdown', 'minMaxDrawdown', -0.2],
    ['maxSharpe 返回 sharpe', 'maxSharpe', 1.5],
    ['maxSortino 返回 sortino', 'maxSortino', 2.0],
  ])('%s', (_n, objective, expected) => {
    expect(objectiveValue(item, objective as never)).toBe(expected);
  });
});

describe('MAX_OPTIMIZER_COMBINATIONS', () => {
  it('上限值为 1000', () => {
    expect(MAX_OPTIMIZER_COMBINATIONS).toBe(1000);
  });
});

function validGridRequest(
  overrides: Partial<GridSearchDomainRequest> = {},
): GridSearchDomainRequest {
  return {
    indicator: 'rsi',
    param1: { min: 2, max: 10, step: 2 },
    param2: { min: 5, max: 25, step: 5 },
    tickers: ['SPY'],
    startDate: '2020-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    rebalanceFrequency: 'monthly',
    objective: 'maxSharpe',
    ...overrides,
  };
}

describe('validateGridSearchRequest', () => {
  it('有效请求返回 null', () => {
    expect(validateGridSearchRequest(validGridRequest())).toBeNull();
  });

  it.each([
    ['缺少 indicator 返回错误', { indicator: '' }, 'indicator'],
    ['空 tickers 返回错误', { tickers: [] }, '标的代码'],
    ['缺少日期返回错误', { startDate: '' }, '起止日期'],
  ])('%s', (_n, overrides, fragment) => {
    expect(validateGridSearchRequest(validGridRequest(overrides))).toContain(fragment);
  });
});

describe('countCombinations', () => {
  it('返回两个参数范围的笛卡尔积大小', () => {
    expect(countCombinations({ min: 2, max: 10, step: 2 }, { min: 5, max: 25, step: 5 })).toBe(25);
  });

  it('步长为零时只算 1 个值', () => {
    expect(countCombinations({ min: 5, max: 5, step: 0 }, { min: 5, max: 5, step: 0 })).toBe(1);
  });
});
