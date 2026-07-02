import { describe, it, expect } from 'vitest';
import { numericRange } from '../../../api/utils/numericRange.js';

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
