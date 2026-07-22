import { describe, it, expect } from 'vitest';
import { percentile, mean, std } from '../../../packages/frontend/src/utils/stats.js';

describe('percentile', () => {
  it('空数组应返回 0', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it('应正确计算百分位（内部升序排序后取索引）', () => {
    // 未排序输入，函数应内部排序为 [10,20,30,40,50]，length=5
    const arr = [50, 10, 40, 20, 30];
    expect(percentile(arr, 0)).toBe(10); // Math.floor(0) = 0 → sorted[0]
    expect(percentile(arr, 0.5)).toBe(30); // Math.floor(5 * 0.5) = 2 → sorted[2]
    expect(percentile(arr, 1)).toBe(50); // Math.min(5, 4) = 4 → sorted[4]
  });

  it('p 超出 1 时应 clamp 到 length-1（最大值）', () => {
    const arr = [10, 20, 30]; // length=3
    expect(percentile(arr, 1)).toBe(30); // Math.min(3, 2) = 2
    expect(percentile(arr, 1.5)).toBe(30); // Math.min(4, 2) = 2
  });
});

describe('mean', () => {
  it('空数组应返回 0', () => {
    expect(mean([])).toBe(0);
  });

  it('应正确计算算术平均（含零值与负数）', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([-1, 0, 1])).toBe(0);
    expect(mean([0, 0, 0])).toBe(0);
  });
});

describe('std', () => {
  it('少于 2 个元素应返回 0', () => {
    expect(std([])).toBe(0);
    expect(std([42])).toBe(0);
  });

  it('应正确计算样本标准差（n-1 分母）', () => {
    // 经典数据集 [2,4,4,4,5,5,7,9]：样本方差 = 32/7 ≈ 4.571，std ≈ 2.138
    const arr = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(std(arr)).toBeCloseTo(2.138, 2);
  });

  it('应处理零值与负数（极差为 2 时 std = sqrt(2)）', () => {
    // [-1, 1]：mean=0, 方差 = ((-1)^2 + 1^2) / (2-1) = 2, std = sqrt(2)
    expect(std([-1, 1])).toBeCloseTo(Math.sqrt(2), 10);
    // [0, 0]：std = 0
    expect(std([0, 0])).toBe(0);
  });
});
