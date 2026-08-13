import { describe, it, expect } from 'vitest';
import {
  computeRollingMetric,
  computeRollingExcessReturn,
} from '../../../packages/frontend/src/components/charts/chartUtils.js';
import {
  computeDailyReturns,
  computeBeta,
  computeRollingCorrelation,
  getCorrelationTextColor,
} from '../../../packages/frontend/src/components/charts/chartUtils.js';
import {
  percentile,
  mean,
  std,
  mergePortfolioSeries,
  mergeRowsByDate,
} from '../../../packages/frontend/src/utils/format.js';

describe('chartCalculations.computeRollingMetric', () => {
  it('数据量不足窗口时应返回空数组', () => {
    expect(computeRollingMetric([0.01, 0.02], ['d1', 'd2'], 252, 'cagr')).toEqual([]);
  });

  it('恒定收益 1%/日、窗口 252 日时滚动 CAGR 应为 (1.01^252 - 1)', () => {
    const returns = Array.from({ length: 253 }, () => 0.01);
    const dates = returns.map((_, i) => `d${i}`);
    const result = computeRollingMetric(returns, dates, 252, 'cagr');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBeCloseTo(Math.pow(1.01, 252) - 1, 8);
    expect(result[0].date).toBe('d252');
  });

  it('恒定收益时滚动波动率为 0', () => {
    const returns = Array.from({ length: 253 }, () => 0.01);
    const dates = returns.map((_, i) => `d${i}`);
    const result = computeRollingMetric(returns, dates, 252, 'volatility');
    expect(result[0].value).toBeCloseTo(0, 8);
  });

  it('完全恒定收益（浮点精确）时 Kelly 值应为 0（方差为 0 保护）', () => {
    const returns = Array.from({ length: 253 }, () => 0.25);
    const dates = returns.map((_, i) => `d${i}`);
    const result = computeRollingMetric(returns, dates, 252, 'kelly');
    expect(result[0].value).toBe(0);
  });
});

describe('chartCalculations.computeRollingExcessReturn', () => {
  it('资产与基准相同时超额收益应为 0', () => {
    const returns = Array.from({ length: 253 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.005));
    const result = computeRollingExcessReturn(
      returns,
      returns,
      returns.map((_, i) => `d${i}`),
      252,
    );
    expect(result).toHaveLength(1);
    expect(result[0].value).toBeCloseTo(0, 8);
  });

  it('数据不足窗口时应返回空数组', () => {
    expect(computeRollingExcessReturn([0.01], [0.01], ['d1'], 252)).toEqual([]);
  });
});

describe('correlationDataTransforms', () => {
  it('computeDailyReturns 应计算相邻日收益率，前值为 0 时跳过该段', () => {
    const curve = [
      { date: 'd1', value: 100 },
      { date: 'd2', value: 110 },
      { date: 'd3', value: 99 },
      { date: 'd4', value: 0 },
      { date: 'd5', value: 50 },
    ];
    expect(computeDailyReturns(curve)).toEqual([0.1, -0.1, -1]);
  });

  it('computeBeta：与基准两倍同向波动时应为 2', () => {
    const base = [0.01, 0.02, 0.03, 0.01];
    const target = [0.02, 0.04, 0.06, 0.02];
    expect(computeBeta(base, target)).toBeCloseTo(2, 8);
  });

  it('computeBeta：数据不足 2 个点时应返回 0', () => {
    expect(computeBeta([0.01], [0.02])).toBe(0);
  });

  it('computeRollingCorrelation：完全正相关序列相关系数应为 1', () => {
    const returns = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? 0.02 : -0.01));
    const dates = returns.map((_, i) => `d${i}`);
    const result = computeRollingCorrelation(returns, returns, dates, 20);
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) expect(p.value).toBeCloseTo(1, 6);
  });

  it('computeRollingCorrelation：完全负相关序列相关系数应为 -1', () => {
    const base = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 0.02 : -0.01));
    const target = base.map((v) => -v);
    const dates = base.map((_, i) => `d${i}`);
    const result = computeRollingCorrelation(base, target, dates, 20);
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) expect(p.value).toBeCloseTo(-1, 6);
  });

  it('computeRollingCorrelation：数据不足窗口时应返回空数组', () => {
    expect(computeRollingCorrelation([0.01, 0.02], [0.01, 0.02], ['d1', 'd2'], 20)).toEqual([]);
  });

  it('getCorrelationTextColor 应按 0.6 阈值切换前景色令牌', () => {
    expect(getCorrelationTextColor(0.7)).toBe('hsl(var(--corr-text-strong))');
    expect(getCorrelationTextColor(0.5)).toBe('hsl(var(--fg))');
    expect(getCorrelationTextColor(-0.7)).toBe('hsl(var(--corr-text-strong))');
  });
});

describe('stats', () => {
  it('percentile 应采用最近秩约定（floor(p*n) 索引）', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(arr, 0.5)).toBe(6);
    expect(percentile(arr, 0.9)).toBe(10);
    expect(percentile([], 0.5)).toBe(0);
  });

  it('mean/std 应返回正确值', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(std([2, 2, 2, 2])).toBe(0);
    expect(std([1, 3])).toBeCloseTo(Math.SQRT2, 8);
  });

  it('mergePortfolioSeries 应合并多组合序列为统一行', () => {
    const portfolios = [
      {
        name: 'A',
        series: [
          { date: '2020-01-01', value: 100 },
          { date: '2020-01-02', value: 110 },
        ],
      },
      { name: 'B', series: [{ date: '2020-01-01', value: 200 }] },
    ] as unknown as Array<{ name: string }>;
    const rows = mergePortfolioSeries(
      portfolios,
      (p) => (p as unknown as { series: Array<{ date: string; value: number }> }).series,
      (item) => item.date,
      (item) => item.value,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2020-01-01', A: 100, B: 200 });
    expect(rows[1]).toMatchObject({ date: '2020-01-02', A: 110 });
  });

  it('mergeRowsByDate 应按键合并行并按日期排序', () => {
    const rows = mergeRowsByDate([
      {
        key: 'p1',
        rows: [{ date: '2020-03-01' }, { date: '2020-01-01' }],
        value: (r) => Number(r.date.slice(8)),
      },
      { key: 'p2', rows: [{ date: '2020-01-01' }], value: () => 7 },
    ]);
    expect(rows).toEqual([
      { date: '2020-01-01', p1: 1, p2: 7 },
      { date: '2020-03-01', p1: 1 },
    ]);
  });
});
