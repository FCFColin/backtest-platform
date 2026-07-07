import { describe, it, expect } from 'vitest';
import { mergePortfolioSeries } from '../../../packages/frontend/src/utils/chartDataMerge.js';

interface MockPortfolio {
  name: string;
  values: Array<{ date: string; v: number }>;
}

describe('mergePortfolioSeries', () => {
  it('空数组应返回空数组', () => {
    const result = mergePortfolioSeries<{ date: string; v: number }, MockPortfolio>(
      [],
      (p) => p.values,
      (item) => item.date,
      (item) => item.v,
    );
    expect(result).toEqual([]);
  });

  it('单组合单条目应正确合并', () => {
    const portfolios: MockPortfolio[] = [{ name: 'A', values: [{ date: '2024-01-01', v: 100 }] }];
    const result = mergePortfolioSeries(
      portfolios,
      (p) => p.values,
      (item) => item.date,
      (item) => item.v,
    );
    expect(result).toEqual([{ date: '2024-01-01', A: 100 }]);
  });

  it('两个组合相同日期应合并为一行', () => {
    const portfolios: MockPortfolio[] = [
      { name: 'A', values: [{ date: '2024-01-01', v: 100 }] },
      { name: 'B', values: [{ date: '2024-01-01', v: 200 }] },
    ];
    const result = mergePortfolioSeries(
      portfolios,
      (p) => p.values,
      (item) => item.date,
      (item) => item.v,
    );
    expect(result).toEqual([{ date: '2024-01-01', A: 100, B: 200 }]);
  });

  it('日期不同时应排序合并', () => {
    const portfolios: MockPortfolio[] = [
      { name: 'A', values: [{ date: '2024-01-03', v: 300 }] },
      {
        name: 'B',
        values: [
          { date: '2024-01-01', v: 100 },
          { date: '2024-01-02', v: 200 },
        ],
      },
    ];
    const result = mergePortfolioSeries(
      portfolios,
      (p) => p.values,
      (item) => item.date,
      (item) => item.v,
    );
    expect(result).toEqual([
      { date: '2024-01-01', A: undefined, B: 100 },
      { date: '2024-01-02', A: undefined, B: 200 },
      { date: '2024-01-03', A: 300, B: undefined },
    ]);
  });

  it('getSeries 返回 undefined 的组合应跳过', () => {
    const portfolios: MockPortfolio[] = [
      { name: 'A', values: [] },
      { name: 'B', values: [{ date: '2024-01-01', v: 100 }] },
    ];
    const result = mergePortfolioSeries(
      portfolios,
      (p) => (p.values.length === 0 ? undefined : p.values),
      (item) => item.date,
      (item) => item.v,
    );
    expect(result).toEqual([{ date: '2024-01-01', B: 100 }]);
  });

  it('使用 year 键名应正确排序数字键', () => {
    const portfolios: MockPortfolio[] = [
      {
        name: 'A',
        values: [
          { date: '2022', v: 200 },
          { date: '2020', v: 100 },
        ],
      },
    ];
    const result = mergePortfolioSeries(
      portfolios,
      (p) => p.values.map((v) => ({ year: Number(v.date), v: v.v })),
      (item) => item.year,
      (item) => item.v,
      'year',
    );
    expect(result).toEqual([
      { year: 2020, A: 100 },
      { year: 2022, A: 200 },
    ]);
  });

  it('多个条目每个组合应全部处理', () => {
    const portfolios: MockPortfolio[] = [
      {
        name: 'A',
        values: [
          { date: '2024-01-01', v: 100 },
          { date: '2024-01-02', v: 200 },
        ],
      },
      { name: 'B', values: [{ date: '2024-01-01', v: 300 }] },
    ];
    const result = mergePortfolioSeries(
      portfolios,
      (p) => p.values,
      (item) => item.date,
      (item) => item.v,
    );
    expect(result).toEqual([
      { date: '2024-01-01', A: 100, B: 300 },
      { date: '2024-01-02', A: 200, B: undefined },
    ]);
  });
});
