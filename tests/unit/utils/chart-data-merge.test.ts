import { describe, it, expect } from 'vitest';
import { mergePortfolioSeries } from '../../../packages/frontend/src/utils/format.js';

interface SeriesItem {
  date?: string;
  year?: number;
  v: number;
}
interface MockPortfolio {
  name: string;
  values: SeriesItem[];
}

const merge = (
  portfolios: MockPortfolio[],
  getSeries: (p: MockPortfolio) => SeriesItem[] | undefined = (p) => p.values,
  key: 'date' | 'year' = 'date',
) =>
  mergePortfolioSeries<SeriesItem, MockPortfolio>(
    portfolios,
    getSeries,
    (item) => item[key] as string | number,
    (item) => item.v,
    key,
  );

describe('mergePortfolioSeries', () => {
  it('空数组应返回空数组', () => {
    const result = merge([]);
    expect(result).toEqual([]);
  });

  it('单组合单条目应正确合并', () => {
    const portfolios: MockPortfolio[] = [{ name: 'A', values: [{ date: '2024-01-01', v: 100 }] }];
    const result = merge(portfolios);
    expect(result).toEqual([{ date: '2024-01-01', A: 100 }]);
  });

  it('两个组合相同日期应合并为一行', () => {
    const portfolios: MockPortfolio[] = [
      { name: 'A', values: [{ date: '2024-01-01', v: 100 }] },
      { name: 'B', values: [{ date: '2024-01-01', v: 200 }] },
    ];
    const result = merge(portfolios);
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
    const result = merge(portfolios);
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
    const result = merge(portfolios, (p) => (p.values.length === 0 ? undefined : p.values));
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
    const result = merge(
      portfolios,
      (p) => p.values.map((v) => ({ year: Number(v.date), v: v.v })),
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
    const result = merge(portfolios);
    expect(result).toEqual([
      { date: '2024-01-01', A: 100, B: 300 },
      { date: '2024-01-02', A: 200, B: undefined },
    ]);
  });
});
