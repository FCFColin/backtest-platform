/**
 * engine/dateUtils 单元测试
 *
 * 企业理由：日期过滤是回测数据查询的基础，过滤错误会导致
 * 回测时间区间错误。测试覆盖：
 * - filterDates 正确过滤日期范围
 * - 空字符串表示不限制
 * - 边界值（恰好等于 start/end）
 * - getDateLimits 返回正确的边界值
 */

import { describe, it, expect } from 'vitest';
import { filterDates, getDateLimits } from '../../../api/utils/dateUtils.js';

describe('filterDates', () => {
  it('应过滤出指定范围内的日期', () => {
    const dates = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01'];
    const result = filterDates(dates, '2024-02-01', '2024-03-01');
    expect(result).toEqual(['2024-02-01', '2024-03-01']);
  });

  it('start 和 end 边界值应包含在结果中', () => {
    const dates = ['2024-01-01', '2024-02-01', '2024-03-01'];
    const result = filterDates(dates, '2024-01-01', '2024-03-01');
    expect(result).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
  });

  it('startDate 为空字符串时应不限制下限', () => {
    const dates = ['2020-01-01', '2024-01-01'];
    const result = filterDates(dates, '', '2024-01-01');
    expect(result).toEqual(['2020-01-01', '2024-01-01']);
  });

  it('endDate 为空字符串时应不限制上限', () => {
    const dates = ['2024-01-01', '2030-01-01'];
    const result = filterDates(dates, '2024-01-01', '');
    expect(result).toEqual(['2024-01-01', '2030-01-01']);
  });

  it('startDate 和 endDate 都为空时应返回全部日期', () => {
    const dates = ['2020-01-01', '2024-01-01', '2030-01-01'];
    const result = filterDates(dates, '', '');
    expect(result).toEqual(dates);
  });

  it('startDate 和 endDate 都为 undefined 时应返回全部日期', () => {
    const dates = ['2020-01-01', '2024-01-01'];
    const result = filterDates(dates);
    expect(result).toEqual(dates);
  });

  it('空数组应返回空数组', () => {
    const result = filterDates([], '2024-01-01', '2024-12-31');
    expect(result).toEqual([]);
  });

  it('全部日期都在范围外时应返回空数组', () => {
    const dates = ['2020-01-01', '2021-01-01'];
    const result = filterDates(dates, '2024-01-01', '2024-12-31');
    expect(result).toEqual([]);
  });

  it('应保持原始顺序', () => {
    const dates = ['2024-03-01', '2024-01-01', '2024-02-01'];
    const result = filterDates(dates, '2024-01-01', '2024-02-01');
    // filter 保持原顺序，不排序
    expect(result).toEqual(['2024-01-01', '2024-02-01']);
  });

  it('单个日期在范围内时应返回单元素数组', () => {
    const dates = ['2024-06-15'];
    const result = filterDates(dates, '2024-01-01', '2024-12-31');
    expect(result).toEqual(['2024-06-15']);
  });

  it('字符串比较应按字典序（YYYY-MM-DD 格式天然有序）', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-10', '2024-01-09'];
    const result = filterDates(dates, '2024-01-05', '2024-12-31');
    // 字典序比较：'2024-01-10' < '2024-01-09' 不成立（'1' < '0' 不成立）
    // 实际：'2024-01-10' > '2024-01-09'（'1' > '0'）
    // 但 '2024-01-05' 与 '2024-01-10' 比较：'0' < '1'，所以 '2024-01-05' < '2024-01-10'
    expect(result).toEqual(['2024-01-10', '2024-01-09']);
  });
});

describe('getDateLimits', () => {
  it('应返回传入的 startDate/endDate', () => {
    const limits = getDateLimits('2024-01-01', '2024-12-31');
    expect(limits).toEqual({
      startLimit: '2024-01-01',
      endLimit: '2024-12-31',
    });
  });

  it('startDate 为空时应返回默认下限 0000-01-01', () => {
    const limits = getDateLimits('', '2024-12-31');
    expect(limits.startLimit).toBe('0000-01-01');
    expect(limits.endLimit).toBe('2024-12-31');
  });

  it('endDate 为空时应返回默认上限 9999-12-31', () => {
    const limits = getDateLimits('2024-01-01', '');
    expect(limits.startLimit).toBe('2024-01-01');
    expect(limits.endLimit).toBe('9999-12-31');
  });

  it('startDate 和 endDate 都为空时应返回默认上下限', () => {
    const limits = getDateLimits('', '');
    expect(limits).toEqual({
      startLimit: '0000-01-01',
      endLimit: '9999-12-31',
    });
  });

  it('startDate 和 endDate 都为 undefined 时应返回默认上下限', () => {
    const limits = getDateLimits();
    expect(limits).toEqual({
      startLimit: '0000-01-01',
      endLimit: '9999-12-31',
    });
  });

  it('返回的对象应包含 startLimit 和 endLimit 字段', () => {
    const limits = getDateLimits('2024-01-01', '2024-12-31');
    expect(limits).toHaveProperty('startLimit');
    expect(limits).toHaveProperty('endLimit');
  });
});
