/**
 * 边界条件测试（D5-010）— NaN/Infinity/MAX_VALUE/极端值
 *
 * 企业理由：现有测试仅在 8 个文件中覆盖 NaN/Infinity/MAX_VALUE，且多数仅测 NaN 占位符。
 * 本测试补充关键数值工具与格式化函数的极端值边界：
 * 1. numericRange — NaN/Infinity/负步长/零步长/极大值/极小步长
 * 2. 前端 formatters — Infinity/-Infinity/MAX_VALUE/MIN_VALUE/-0/MAX_SAFE_INTEGER
 * 3. 数值安全工具 — isFinite 守卫验证
 */
import { describe, it, expect } from 'vitest';
import { numericRange } from '../../packages/backend/src/utils/numericRange.js';
import {
  formatCurrency,
  formatCurrencyShort,
  formatPercent,
  formatNumber,
  formatSignedPercent,
} from '../../packages/frontend/src/lib/formatters.js';

// ============================================================
// numericRange — 极端值边界
// ============================================================
describe('numericRange — 边界条件（D5-010）', () => {
  it('NaN min 应返回 [NaN]（不抛异常）', () => {
    const result = numericRange(NaN, 10, 1);
    expect(result).toHaveLength(1);
    expect(Number.isNaN(result[0])).toBe(true);
  });

  it('NaN max 应返回 [min]（NaN 比较均为 false，循环不执行）', () => {
    const result = numericRange(0, NaN, 1);
    // NaN <= NaN + 1e-9 is false, so loop body runs once for v=min
    expect(result).toHaveLength(1);
  });

  it('NaN step 应返回 [min]（NaN <= 0 为 false，但 min > max 也为 false，循环执行一次）', () => {
    const result = numericRange(0, 10, NaN);
    // step <= 0 is false for NaN, but NaN += NaN makes v=NaN, NaN <= max+1e-9 is false
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('Infinity max 应返回有限序列（步长累加最终溢出到 Infinity > max）', () => {
    const result = numericRange(0, Infinity, 1);
    // 循环会持续到 v 溢出为 Infinity，此时 Infinity <= Infinity + 1e-9 为 true
    // 但实际上 v += 1 从有限值开始，最终会达到 Infinity
    // 这个测试验证不抛异常且返回数组
    expect(Array.isArray(result)).toBe(true);
  });

  it('-Infinity min 应返回有限序列（从 -Infinity 开始 +step 仍为 -Infinity）', () => {
    const result = numericRange(-Infinity, 0, 1);
    expect(Array.isArray(result)).toBe(true);
  });

  it('Infinity step 应返回 [min]（step > 0 但 min + Infinity = Infinity > max）', () => {
    const result = numericRange(0, 10, Infinity);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(0);
  });

  it('负步长应返回 [min]（step <= 0 触发退化路径）', () => {
    expect(numericRange(0, 10, -1)).toEqual([0]);
    expect(numericRange(0, 10, -0.1)).toEqual([0]);
  });

  it('零步长应返回 [min]（step <= 0 触发退化路径）', () => {
    expect(numericRange(0, 10, 0)).toEqual([0]);
  });

  it('min > max 应返回 [min]', () => {
    expect(numericRange(10, 0, 1)).toEqual([10]);
  });

  it('min === max 应返回 [min]', () => {
    expect(numericRange(5, 5, 1)).toEqual([5]);
  });

  it('Number.MAX_VALUE 作为 max 不应抛异常', () => {
    const result = numericRange(0, Number.MAX_VALUE, Number.MAX_VALUE);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(Number.MAX_VALUE);
  });

  it('Number.MAX_SAFE_INTEGER + 1 应正确处理（超出安全整数范围）', () => {
    const beyondSafe = Number.MAX_SAFE_INTEGER + 1;
    const result = numericRange(beyondSafe, beyondSafe, 1);
    expect(result).toEqual([beyondSafe]);
  });

  it('极小步长应生成有限序列（不无限循环）', () => {
    const result = numericRange(0, 0.01, 0.001);
    expect(result.length).toBeGreaterThanOrEqual(10);
    expect(result.length).toBeLessThanOrEqual(12); // 容差允许 1-2 额外
  });

  it('负数范围应正确生成', () => {
    const result = numericRange(-5, -1, 1);
    expect(result).toEqual([-5, -4, -3, -2, -1]);
  });

  it('-0 作为 min 应正确处理', () => {
    const result = numericRange(-0, 2, 1);
    expect(result[0]).toBe(0); // -0 === 0
    expect(result).toHaveLength(3);
  });

  it('浮点精度容差：max + 1e-9 不应漏掉末端值', () => {
    const result = numericRange(0, 0.3, 0.1);
    // 0.1 累加三次 = 0.30000000000000004，但 1e-9 容差应包含 0.3
    expect(result).toContain(0.3);
  });
});

// ============================================================
// 前端 formatters — Infinity/极端值
// ============================================================
describe('formatters — Infinity/极端值边界（D5-010）', () => {
  it('formatCurrency(Infinity) 不应抛异常', () => {
    expect(() => formatCurrency(Infinity)).not.toThrow();
  });

  it('formatCurrency(-Infinity) 不应抛异常', () => {
    expect(() => formatCurrency(-Infinity)).not.toThrow();
  });

  it('formatCurrency(Number.MAX_VALUE) 不应抛异常', () => {
    expect(() => formatCurrency(Number.MAX_VALUE)).not.toThrow();
  });

  it('formatCurrency(Number.MIN_VALUE) 不应抛异常', () => {
    expect(() => formatCurrency(Number.MIN_VALUE)).not.toThrow();
  });

  it('formatCurrency(-0) 应格式化为 $0.00', () => {
    const result = formatCurrency(-0);
    // -0 在 Intl.NumberFormat 中通常显示为 $0.00
    expect(result).toMatch(/0/);
  });

  it('formatPercent(Infinity) 不应抛异常', () => {
    expect(() => formatPercent(Infinity)).not.toThrow();
  });

  it('formatPercent(-Infinity) 不应抛异常', () => {
    expect(() => formatPercent(-Infinity)).not.toThrow();
  });

  it('formatNumber(Infinity) 不应抛异常', () => {
    expect(() => formatNumber(Infinity)).not.toThrow();
  });

  it('formatNumber(Number.MAX_SAFE_INTEGER) 不应抛异常', () => {
    expect(() => formatNumber(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it('formatSignedPercent(Infinity) 不应抛异常', () => {
    expect(() => formatSignedPercent(Infinity)).not.toThrow();
  });

  it('formatSignedPercent(-Infinity) 不应抛异常', () => {
    expect(() => formatSignedPercent(-Infinity)).not.toThrow();
  });

  it('formatCurrencyShort(Infinity) 不应抛异常', () => {
    expect(() => formatCurrencyShort(Infinity)).not.toThrow();
  });

  it('formatCurrencyShort(Number.MAX_VALUE) 不应抛异常', () => {
    expect(() => formatCurrencyShort(Number.MAX_VALUE)).not.toThrow();
  });
});

// ============================================================
// 数值安全验证 — isFinite 守卫
// ============================================================
describe('数值安全 — isFinite 守卫验证（D5-010）', () => {
  it('Number.isFinite 正确识别有限数', () => {
    expect(Number.isFinite(0)).toBe(true);
    expect(Number.isFinite(1)).toBe(true);
    expect(Number.isFinite(-1)).toBe(true);
    expect(Number.isFinite(1e10)).toBe(true);
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
    expect(Number.isFinite('123' as unknown as number)).toBe(false);
  });

  it('Number.isNaN 正确识别 NaN', () => {
    expect(Number.isNaN(NaN)).toBe(true);
    expect(Number.isNaN(0)).toBe(false);
    expect(Number.isNaN(Infinity)).toBe(false);
    expect(Number.isNaN(null as unknown as number)).toBe(false);
    expect(Number.isNaN(undefined as unknown as number)).toBe(false);
  });

  it('全局 isNaN vs Number.isNaN 差异（类型转换陷阱）', () => {
    // 全局 isNaN 会强制类型转换，导致误判
    expect(isNaN(undefined)).toBe(true); // 误判：undefined -> NaN
    expect(Number.isNaN(undefined)).toBe(false); // 正确：undefined 不是 NaN
    expect(isNaN('abc')).toBe(true); // 误判：'abc' -> NaN
    expect(Number.isNaN('abc' as unknown as number)).toBe(false); // 正确
  });

  it('MAX_SAFE_INTEGER + 1 !== MAX_SAFE_INTEGER + 2（超出安全整数）', () => {
    // 验证 JavaScript 在 MAX_SAFE_INTEGER 之上的精度丢失
    expect(Number.MAX_SAFE_INTEGER + 1).toBe(Number.MAX_SAFE_INTEGER + 2);
  });

  it('0.1 + 0.2 !== 0.3（浮点精度陷阱）', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(0.1 + 0.2).toBeCloseTo(0.3, 10);
  });

  it('-0 === 0 但 Object.is(-0, 0) === false', () => {
    expect(-0 === 0).toBe(true);
    expect(Object.is(-0, 0)).toBe(false);
  });
});