import { describe, it, expect } from 'vitest';
import { numericRange } from '../../../packages/backend/src/utils/numericRange.js';

describe('numericRange', () => {
  it('应生成递增等差序列', () => {
    expect(numericRange(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('step <= 0 应回退为 [min]', () => {
    expect(numericRange(5, 10, 0)).toEqual([5]);
    expect(numericRange(5, 10, -1)).toEqual([5]);
  });

  it('min > max 应回退为 [min]', () => {
    expect(numericRange(10, 5, 1)).toEqual([10]);
  });

  it('应按 decimals 参数四舍五入', () => {
    expect(numericRange(0, 1, 0.3, 1)).toEqual([0, 0.3, 0.6, 0.9]);
  });

  it('应处理浮点边界避免末端遗漏', () => {
    const result = numericRange(0, 0.5, 0.1, 2);
    expect(result).toContain(0.5);
    expect(result).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('默认 decimals = 2', () => {
    const result = numericRange(0, 0.3, 0.1);
    expect(result).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it('min === max 应返回 [min]', () => {
    expect(numericRange(5, 5, 1)).toEqual([5]);
  });
});

// ============================================================
// D5-010: 边界条件测试 — NaN/Infinity/MAX_VALUE/极端值
// ============================================================
describe('numericRange — 边界条件（D5-010）', () => {
  it('NaN min 应返回空数组（NaN 比较均为 false，循环不执行）', () => {
    const result = numericRange(NaN, 10, 1);
    expect(result).toEqual([]);
  });

  it('NaN max 应返回空数组（NaN <= NaN+1e-9 为 false）', () => {
    const result = numericRange(0, NaN, 1);
    expect(result).toEqual([]);
  });

  it('NaN step 应返回 [0]（v+=NaN 后 NaN<=max 为 false，循环执行一次）', () => {
    const result = numericRange(0, 10, NaN);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(0); // 第一次迭代 v=0，之后 v+=NaN 退出
  });

  it('Infinity max 应抛出 RangeError（数组无限增长）', () => {
    expect(() => numericRange(0, Infinity, 1)).toThrow(RangeError);
  });

  it('-Infinity min 应抛出 RangeError（-Infinity+1 仍为 -Infinity）', () => {
    expect(() => numericRange(-Infinity, 0, 1)).toThrow(RangeError);
  });

  it('Infinity step 应返回 [min]（min+Infinity=Infinity>max，循环一次）', () => {
    const result = numericRange(0, 10, Infinity);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(0);
  });

  it('Number.MAX_VALUE 作为 max 时 Math.round 溢出为 Infinity', () => {
    const result = numericRange(0, Number.MAX_VALUE, Number.MAX_VALUE);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(0);
    // MAX_VALUE * 100 溢出为 Infinity，Math.round(Infinity)/100 = Infinity
    expect(result[1]).toBe(Infinity);
  });

  it('极大整数范围应抛出 RangeError（数组过大）', () => {
    const beyondSafe = Number.MAX_SAFE_INTEGER + 1;
    expect(() => numericRange(beyondSafe, beyondSafe + 2, 1)).toThrow(RangeError);
  });

  it('极小步长应生成有限序列（不无限循环）', () => {
    const result = numericRange(0, 0.01, 0.001);
    expect(result.length).toBeGreaterThanOrEqual(10);
    expect(result.length).toBeLessThanOrEqual(12);
  });

  it('-0 作为 min 时 Math.round 保留 -0', () => {
    const result = numericRange(-0, 2, 1);
    expect(result).toHaveLength(3);
    // -0 * 100 = -0, Math.round(-0) = -0, -0 / 100 = -0
    // Object.is(-0, 0) === false，但 -0 === 0 === true
    expect(Object.is(result[0], -0)).toBe(true); // Math.round 保留 -0
  });

  it('浮点精度容差：max + 1e-9 不应漏掉末端值', () => {
    const result = numericRange(0, 0.3, 0.1);
    expect(result).toContain(0.3);
  });
});

// ============================================================
// D5-010: 数值安全验证 — isFinite/isNaN 守卫
// ============================================================
describe('数值安全 — isFinite/isNaN 守卫验证（D5-010）', () => {
  it('Number.isFinite 正确识别有限数', () => {
    expect(Number.isFinite(0)).toBe(true);
    expect(Number.isFinite(1)).toBe(true);
    expect(Number.isFinite(-1)).toBe(true);
    expect(Number.isFinite(Number.MAX_VALUE)).toBe(true);
    expect(Number.isFinite(Number.MIN_VALUE)).toBe(true);
    expect(Number.isFinite(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('Number.isFinite 正确排除非法值', () => {
    expect(Number.isFinite(NaN)).toBe(false);
    expect(Number.isFinite(Infinity)).toBe(false);
    expect(Number.isFinite(-Infinity)).toBe(false);
    expect(Number.isFinite(null as unknown as number)).toBe(false);
    expect(Number.isFinite(undefined as unknown as number)).toBe(false);
  });

  it('0.1 + 0.2 !== 0.3（浮点精度陷阱）', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(0.1 + 0.2).toBeCloseTo(0.3, 10);
  });

  it('-0 === 0 但 Object.is(-0, 0) === false', () => {
    expect(-0 === 0).toBe(true);
    expect(Object.is(-0, 0)).toBe(false);
  });

  it('MAX_SAFE_INTEGER + 1 === MAX_SAFE_INTEGER + 2（精度丢失）', () => {
    expect(Number.MAX_SAFE_INTEGER + 1).toBe(Number.MAX_SAFE_INTEGER + 2);
  });
});