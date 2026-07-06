/**
 * Weight Value Object 单元测试（百分比语义 0–100，T-30）
 */
import { describe, it, expect } from 'vitest';
import { Weight } from '../../../packages/backend/src/domain/value-objects/weight.js';

describe('Weight.create', () => {
  it.each([
    [0, '下边界 0%'],
    [100, '上边界 100%'],
    [50, '一半'],
    [25, '四分之一'],
  ])('应接受 %s（%s）', (value) => {
    const weight = Weight.create(value);
    expect(weight.value).toBe(value);
  });

  it('应拒绝负数', () => {
    expect(() => Weight.create(-1)).toThrow(/between 0 and 100/);
  });

  it('应拒绝大于 100', () => {
    expect(() => Weight.create(101)).toThrow(/between 0 and 100/);
  });

  it('toFraction 转为小数', () => {
    expect(Weight.create(60).toFraction()).toBeCloseTo(0.6);
  });
});

describe('Weight.equals', () => {
  it('相同值应相等', () => {
    expect(Weight.create(50).equals(Weight.create(50))).toBe(true);
  });

  it('微小误差应视为相等', () => {
    expect(Weight.create(50).equals(Weight.create(50.000001))).toBe(true);
  });

  it('不同值应不相等', () => {
    expect(Weight.create(50).equals(Weight.create(60))).toBe(false);
  });

  it('边界值 0 和 0 应相等', () => {
    expect(Weight.create(0).equals(Weight.create(0))).toBe(true);
  });
});
