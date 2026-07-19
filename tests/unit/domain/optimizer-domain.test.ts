/**
 * optimizer-domain 纯领域逻辑单元测试
 *
 * 覆盖：参数序列生成、回测参数构建、请求校验、组合构建、约束过滤、目标函数。
 * 所有函数无副作用，可直接测试无需 mock。
 */
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
import type { BacktestOptimizerRequest } from '../../../packages/backend/src/schemas/optimizer.js';

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
  it('正步长生成等差数列', () => {
    expect(range(1, 5, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it('步长为 2 时跳过中间值', () => {
    expect(range(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('min === max 时返回单元素', () => {
    expect(range(5, 5, 1)).toEqual([5]);
  });

  it('浮点步长保留两位小数', () => {
    expect(range(0, 0.03, 0.01)).toEqual([0, 0.01, 0.02, 0.03]);
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
    expect(params.extendedWithdrawalStats).toBe(false);
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

  it('缺少 portfolio.assets 返回错误', () => {
    expect(validateOptimizeRequest(validRequest({ portfolio: { assets: [] } }))).toContain(
      'portfolio.assets',
    );
  });

  it('缺少 rebalanceFrequencies 返回错误', () => {
    expect(
      validateOptimizeRequest(
        validRequest({
          parameterSpace: {
            rebalanceFrequencies: [],
            initialCapital: { min: 10000, max: 20000, step: 10000 },
          },
        }),
      ),
    ).toContain('再平衡频率');
  });

  it('缺少日期范围返回错误', () => {
    expect(
      validateOptimizeRequest(validRequest({ parameters: { startDate: '', endDate: '' } })),
    ).toContain('日期');
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

  it('无约束时返回全部', () => {
    expect(filterByConstraints(items)).toHaveLength(3);
  });

  it('maxDrawdown 约束过滤超出项', () => {
    const filtered = filterByConstraints(items, { maxDrawdown: 20 });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((it) => it.maxDrawdown <= 0.2)).toBe(true);
  });

  it('minCagr 约束过滤低于项', () => {
    const filtered = filterByConstraints(items, { minCagr: 8 });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((it) => it.cagr >= 0.08)).toBe(true);
  });

  it('同时约束时取交集', () => {
    const filtered = filterByConstraints(items, { maxDrawdown: 20, minCagr: 8 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].cagr).toBe(0.08);
  });
});

describe('objectiveValue', () => {
  const item = makeItem({ cagr: 0.1, maxDrawdown: 0.2, sharpe: 1.5, sortino: 2.0 });

  it('maxCagr 返回 cagr', () => {
    expect(objectiveValue(item, 'maxCagr')).toBe(0.1);
  });

  it('minMaxDrawdown 返回负的 maxDrawdown', () => {
    expect(objectiveValue(item, 'minMaxDrawdown')).toBe(-0.2);
  });

  it('maxSharpe 返回 sharpe', () => {
    expect(objectiveValue(item, 'maxSharpe')).toBe(1.5);
  });

  it('maxSortino 返回 sortino', () => {
    expect(objectiveValue(item, 'maxSortino')).toBe(2.0);
  });
});

describe('MAX_OPTIMIZER_COMBINATIONS', () => {
  it('上限值为 1000', () => {
    expect(MAX_OPTIMIZER_COMBINATIONS).toBe(1000);
  });
});
