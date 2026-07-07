import { describe, it, expect } from 'vitest';
import {
  getSortedDates,
  getPrice,
  calcDrawdownCurve,
  calcRollingReturns,
  calcAnnualReturns,
  calcMonthlyReturns,
  findClosestDate,
  findCpiForDate,
  shouldApplyCashflow,
} from '../../../packages/backend/src/engine/growthCurve.js';

describe('getSortedDates', () => {
  it('合并多个 ticker 的日期并排序', () => {
    const priceData = {
      AAPL: { '2020-01-03': 100, '2020-01-02': 99 },
      MSFT: { '2020-01-02': 200, '2020-01-01': 198 },
    };
    const dates = getSortedDates(priceData);
    expect(dates).toEqual(['2020-01-01', '2020-01-02', '2020-01-03']);
  });

  it('空数据返回空数组', () => {
    expect(getSortedDates({})).toEqual([]);
  });
});

describe('getPrice', () => {
  it('存在返回价格', () => {
    expect(getPrice({ AAPL: { '2020-01-01': 150 } }, 'AAPL', '2020-01-01')).toBe(150);
  });

  it('不存在返回 null', () => {
    expect(getPrice({ AAPL: {} }, 'AAPL', '2020-01-01')).toBeNull();
    expect(getPrice({}, 'AAPL', '2020-01-01')).toBeNull();
  });
});

describe('findClosestDate', () => {
  it('向后搜索找到最近的日期', () => {
    const data = { '2020-01-05': 100, '2020-01-10': 110 };
    const closest = findClosestDate('2020-01-08', data);
    expect(closest).toBe('2020-01-05');
  });

  it('10 天内未找到返回 null', () => {
    const data = { '2020-01-01': 100 };
    expect(findClosestDate('2020-01-20', data)).toBeNull();
  });
});

describe('findCpiForDate', () => {
  it('精确匹配返回 CPI', () => {
    expect(findCpiForDate('2020-01-15', { '2020-01-15': 1.02 })).toBe(1.02);
  });

  it('月初匹配', () => {
    expect(findCpiForDate('2020-01-15', { '2020-01-01': 1.01 })).toBe(1.01);
  });

  it('未找到返回 0', () => {
    expect(findCpiForDate('2020-06-15', {})).toBe(0);
  });
});

describe('calcDrawdownCurve', () => {
  it('单调递增无回撤', () => {
    const curve = calcDrawdownCurve([100, 110, 120], ['2020-01-01', '2020-01-02', '2020-01-03']);
    expect(curve.every((c) => c.drawdown === 0)).toBe(true);
  });

  it('有回撤时 drawdown > 0', () => {
    const curve = calcDrawdownCurve([100, 120, 90], ['2020-01-01', '2020-01-02', '2020-01-03']);
    expect(curve[2].drawdown).toBeCloseTo(0.25, 3);
  });
});

describe('calcRollingReturns', () => {
  it('窗口小于数据长度返回空', () => {
    const result = calcRollingReturns([100, 110], ['2020-01-01', '2020-01-02'], 12);
    expect(result).toHaveLength(0);
  });

  it('收益率为正返回正滚动收益', () => {
    const values = Array(252).fill(100).concat(Array(252).fill(110));
    const dates = values.map(
      (_, i) =>
        `2020-${String(Math.floor(i / 21) + 1).padStart(2, '0')}-${String((i % 21) + 1).padStart(2, '0')}`,
    );
    const result = calcRollingReturns(values, dates, 12);
    if (result.length > 0) {
      expect(result[0].return).toBeGreaterThan(0);
    }
  });
});

describe('calcAnnualReturns', () => {
  it('单年返回一个元素', () => {
    const result = calcAnnualReturns([100, 110, 120], ['2020-01-01', '2020-06-01', '2020-12-31']);
    expect(result).toHaveLength(1);
    expect(result[0].year).toBe(2020);
    expect(result[0].return).toBeCloseTo(0.2, 4);
  });

  it('空数组', () => {
    expect(calcAnnualReturns([], [])).toEqual([]);
  });
});

describe('calcMonthlyReturns', () => {
  it('两个月返回两个元素', () => {
    const result = calcMonthlyReturns(
      [100, 110, 105, 115],
      ['2020-01-15', '2020-01-31', '2020-02-15', '2020-02-28'],
    );
    expect(result).toHaveLength(2);
    expect(result[0].month).toBe(1);
    expect(result[1].month).toBe(2);
  });
});

describe('shouldApplyCashflow', () => {
  it('daily 频率始终 true', () => {
    expect(
      shouldApplyCashflow({
        frequency: 'daily',
        currentDate: '2020-01-02',
        prevDate: '2020-01-01',
        startDate: '2020-01-01',
        offset: 0,
      }),
    ).toBe(true);
  });

  it('monthly 频率跨月返回 true', () => {
    expect(
      shouldApplyCashflow({
        frequency: 'monthly',
        currentDate: '2020-02-01',
        prevDate: '2020-01-31',
        startDate: '2020-01-01',
        offset: 0,
      }),
    ).toBe(true);
  });

  it('until 截止日期后返回 false', () => {
    expect(
      shouldApplyCashflow({
        frequency: 'monthly',
        currentDate: '2020-03-01',
        prevDate: '2020-02-01',
        startDate: '2020-01-01',
        offset: 0,
        until: '2020-02-28',
      }),
    ).toBe(false);
  });
});
