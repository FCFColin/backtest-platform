/**
 * engine/seriesUtils 单元测试
 *
 * 企业理由：价格序列转换是回测引擎的输入预处理，转换错误会导致
 * 回测计算基于错误数据。测试覆盖：
 * - toSortedSeries 按 date 升序排序，过滤 NaN/0/负值
 * - toPriceSeries 按 date 升序排序，仅过滤 NaN
 * - 空输入/undefined 处理
 * - 乱序输入排序
 */

import { describe, it, expect } from 'vitest';
import { toSortedSeries, toPriceSeries } from '../../../api/engine/seriesUtils.js';

describe('toSortedSeries', () => {
  it('应将 {date: price} 转为按日期升序的数组', () => {
    const data = {
      '2024-01-03': 103,
      '2024-01-01': 100,
      '2024-01-02': 101,
    };
    const result = toSortedSeries(data);

    expect(result).toEqual([
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-02', price: 101 },
      { date: '2024-01-03', price: 103 },
    ]);
  });

  it('应过滤 NaN 值', () => {
    const data = {
      '2024-01-01': 100,
      '2024-01-02': NaN,
      '2024-01-03': 103,
    };
    const result = toSortedSeries(data);

    expect(result).toEqual([
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-03', price: 103 },
    ]);
  });

  it('应过滤 0 值', () => {
    const data = {
      '2024-01-01': 100,
      '2024-01-02': 0,
      '2024-01-03': 103,
    };
    const result = toSortedSeries(data);

    expect(result).toEqual([
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-03', price: 103 },
    ]);
  });

  it('应过滤负值', () => {
    const data = {
      '2024-01-01': 100,
      '2024-01-02': -5,
      '2024-01-03': 103,
    };
    const result = toSortedSeries(data);

    expect(result).toEqual([
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-03', price: 103 },
    ]);
  });

  it('应过滤非数字类型', () => {
    const data = {
      '2024-01-01': 100,
      '2024-01-02': 'string' as unknown as number,
      '2024-01-03': 103,
    };
    const result = toSortedSeries(data);

    expect(result).toEqual([
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-03', price: 103 },
    ]);
  });

  it('undefined 输入应返回空数组', () => {
    const result = toSortedSeries(undefined);
    expect(result).toEqual([]);
  });

  it('空对象应返回空数组', () => {
    const result = toSortedSeries({});
    expect(result).toEqual([]);
  });

  it('全部值为 NaN/0/负值时应返回空数组', () => {
    const data = {
      '2024-01-01': NaN,
      '2024-01-02': 0,
      '2024-01-03': -1,
    };
    const result = toSortedSeries(data);
    expect(result).toEqual([]);
  });

  it('单个有效值应返回单元素数组', () => {
    const data = { '2024-01-01': 100 };
    const result = toSortedSeries(data);
    expect(result).toEqual([{ date: '2024-01-01', price: 100 }]);
  });

  it('小数价格应保留', () => {
    const data = { '2024-01-01': 99.99 };
    const result = toSortedSeries(data);
    expect(result).toEqual([{ date: '2024-01-01', price: 99.99 }]);
  });

  it('极小正数应保留（> 0 即可）', () => {
    const data = { '2024-01-01': 0.001 };
    const result = toSortedSeries(data);
    expect(result).toEqual([{ date: '2024-01-01', price: 0.001 }]);
  });
});

describe('toPriceSeries', () => {
  it('应将 {date: price} 转为按日期升序的数组', () => {
    const data = {
      '2024-01-03': 103,
      '2024-01-01': 100,
      '2024-01-02': 101,
    };
    const result = toPriceSeries(data);

    expect(result).toEqual([
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-02', price: 101 },
      { date: '2024-01-03', price: 103 },
    ]);
  });

  it('应过滤 NaN 值', () => {
    const data = {
      '2024-01-01': 100,
      '2024-01-02': NaN,
      '2024-01-03': 103,
    };
    const result = toPriceSeries(data);

    expect(result).toEqual([
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-03', price: 103 },
    ]);
  });

  it('应保留 0 值（与 toSortedSeries 不同）', () => {
    const data = {
      '2024-01-01': 100,
      '2024-01-02': 0,
      '2024-01-03': 103,
    };
    const result = toPriceSeries(data);

    expect(result).toEqual([
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-02', price: 0 },
      { date: '2024-01-03', price: 103 },
    ]);
  });

  it('应保留负值（与 toSortedSeries 不同）', () => {
    const data = {
      '2024-01-01': 100,
      '2024-01-02': -5,
      '2024-01-03': 103,
    };
    const result = toPriceSeries(data);

    expect(result).toEqual([
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-02', price: -5 },
      { date: '2024-01-03', price: 103 },
    ]);
  });

  it('应过滤非数字类型', () => {
    const data = {
      '2024-01-01': 100,
      '2024-01-02': 'string' as unknown as number,
      '2024-01-03': 103,
    };
    const result = toPriceSeries(data);

    expect(result).toEqual([
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-03', price: 103 },
    ]);
  });

  it('undefined 输入应返回空数组', () => {
    const result = toPriceSeries(undefined);
    expect(result).toEqual([]);
  });

  it('空对象应返回空数组', () => {
    const result = toPriceSeries({});
    expect(result).toEqual([]);
  });

  it('全部值为 NaN 时应返回空数组', () => {
    const data = {
      '2024-01-01': NaN,
      '2024-01-02': NaN,
    };
    const result = toPriceSeries(data);
    expect(result).toEqual([]);
  });

  it('单个有效值应返回单元素数组', () => {
    const data = { '2024-01-01': 100 };
    const result = toPriceSeries(data);
    expect(result).toEqual([{ date: '2024-01-01', price: 100 }]);
  });

  it('应处理大量日期（性能验证）', () => {
    const data: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const date = `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`;
      data[date] = 100 + i;
    }
    const result = toPriceSeries(data);
    expect(result).toHaveLength(1000);
    // 验证排序正确
    for (let i = 1; i < result.length; i++) {
      expect(result[i].date.localeCompare(result[i - 1].date)).toBeGreaterThanOrEqual(0);
    }
  });
});
