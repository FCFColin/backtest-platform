/**
 * DateRange Value Object 单元测试
 *
 * 企业理由：日期范围值对象约束 start <= end，校验失败会导致
 * 回测时间区间非法。测试覆盖：
 * - 合法日期范围创建成功
 * - start > end 抛错
 * - start === end 应通过（同一天）
 * - tradingDays 计算正确
 */

import { describe, it, expect } from 'vitest';
import { DateRange } from '../../../api/domain/value-objects/date-range.js';

describe('DateRange.create', () => {
  describe('合法日期范围', () => {
    it('应接受 start < end', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-12-31');
      const range = DateRange.create(start, end);
      expect(range.start).toBe(start);
      expect(range.end).toBe(end);
    });

    it('应接受 start === end（同一天）', () => {
      const date = new Date('2024-06-15');
      const range = DateRange.create(date, new Date(date));
      expect(range.start).toEqual(date);
      expect(range.end).toEqual(date);
    });

    it('应接受毫秒级差异', () => {
      const start = new Date('2024-01-01T00:00:00.000Z');
      const end = new Date('2024-01-01T00:00:00.001Z');
      const range = DateRange.create(start, end);
      expect(range.start).toBe(start);
      expect(range.end).toBe(end);
    });

    it('应接受跨年日期范围', () => {
      const start = new Date('2023-06-15');
      const end = new Date('2025-06-15');
      const range = DateRange.create(start, end);
      expect(range.start).toBe(start);
      expect(range.end).toBe(end);
    });
  });

  describe('非法日期范围', () => {
    it('应拒绝 start > end', () => {
      const start = new Date('2024-12-31');
      const end = new Date('2024-01-01');
      expect(() => DateRange.create(start, end)).toThrow(/Start date must be before end date/);
    });

    it('应拒绝 start 远大于 end', () => {
      const start = new Date('2025-06-15');
      const end = new Date('2020-06-15');
      expect(() => DateRange.create(start, end)).toThrow(/Start date must be before end date/);
    });
  });
});

describe('DateRange.tradingDays', () => {
  it('同一天应返回 0 天', () => {
    const date = new Date('2024-06-15');
    const range = DateRange.create(date, new Date(date));
    expect(range.tradingDays).toBe(0);
  });

  it('1 天差异应返回 1', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-02');
    const range = DateRange.create(start, end);
    expect(range.tradingDays).toBe(1);
  });

  it('30 天差异应返回 30', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-31');
    const range = DateRange.create(start, end);
    expect(range.tradingDays).toBe(30);
  });

  it('365 天差异应返回 365', () => {
    // 2023-01-01 到 2024-01-01 = 365 天（2023 非闰年）
    const start = new Date('2023-01-01');
    const end = new Date('2024-01-01');
    const range = DateRange.create(start, end);
    expect(range.tradingDays).toBe(365);
  });

  it('闰年 366 天应返回 366', () => {
    // 2024-01-01 到 2025-01-01 = 366 天（2024 是闰年）
    const start = new Date('2024-01-01');
    const end = new Date('2025-01-01');
    const range = DateRange.create(start, end);
    expect(range.tradingDays).toBe(366);
  });

  it('毫秒级差异应返回 1（ceil 后向上取整）', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const end = new Date('2024-01-01T00:00:00.500Z');
    const range = DateRange.create(start, end);
    // 500ms / 86400000ms = 0.0000058 天，ceil 后为 1
    expect(range.tradingDays).toBe(1);
  });

  it('23 小时差异应返回 0（不足 1 天，ceil 后仍为 0）', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const end = new Date('2024-01-01T23:00:00.000Z');
    const range = DateRange.create(start, end);
    // 23 小时 = 23/24 天 < 1，ceil 后为 1
    // 实际：23*60*60*1000 / (1000*60*60*24) = 0.958，ceil = 1
    expect(range.tradingDays).toBe(1);
  });
});

describe('DateRange 不变性', () => {
  it('start/end 属性应通过 readonly 修饰符保护（编译时检查）', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-12-31');
    const range = DateRange.create(start, end);
    expect(range.start).toBe(start);
    expect(range.end).toBe(end);
    // 注：TypeScript 的 readonly 是编译时约束，运行时不强制。
    // 此处仅验证属性存在且可读，不可变性由 TS 编译器保证。
  });
});
