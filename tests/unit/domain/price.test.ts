/**
 * Price Value Object 单元测试
 *
 * 企业理由：价格值对象约束价格非负，校验失败会导致回测计算
 * 出现负资产等逻辑错误。测试覆盖：
 * - 合法价格创建成功（含默认货币、自定义货币）
 * - 负数价格抛错
 * - 相等性比较（value + currency 双重比较）
 */

import { describe, it, expect } from 'vitest';
import { Price } from '../../../packages/backend/src/domain/value-objects/price.js';

describe('Price.create', () => {
  describe('合法价格', () => {
    it('应接受正数价格（默认货币 CNY）', () => {
      const price = Price.create(100);
      expect(price.value).toBe(100);
      expect(price.currency).toBe('CNY');
    });

    it('应接受 0 价格', () => {
      const price = Price.create(0);
      expect(price.value).toBe(0);
    });

    it('应接受小数价格', () => {
      const price = Price.create(99.99);
      expect(price.value).toBe(99.99);
    });

    it('应接受自定义货币 USD', () => {
      const price = Price.create(150, 'USD');
      expect(price.value).toBe(150);
      expect(price.currency).toBe('USD');
    });

    it('应接受极小价格', () => {
      const price = Price.create(0.001);
      expect(price.value).toBe(0.001);
    });

    it('应接受极大价格', () => {
      const price = Price.create(1_000_000);
      expect(price.value).toBe(1_000_000);
    });
  });

  describe('非法价格', () => {
    it('应拒绝负数', () => {
      expect(() => Price.create(-1)).toThrow(/Price cannot be negative/);
    });

    it('应拒绝 -0.01', () => {
      expect(() => Price.create(-0.01)).toThrow(/Price cannot be negative/);
    });

    it('应拒绝 -1000', () => {
      expect(() => Price.create(-1000)).toThrow(/Price cannot be negative/);
    });

    it('错误信息应包含非法值', () => {
      try {
        Price.create(-50);
        fail('应抛出错误');
      } catch (err) {
        expect((err as Error).message).toContain('-50');
      }
    });
  });
});

describe('Price.equals', () => {
  it('相同 value 和 currency 应相等', () => {
    const p1 = Price.create(100, 'CNY');
    const p2 = Price.create(100, 'CNY');
    expect(p1.equals(p2)).toBe(true);
  });

  it('相同 value 但不同 currency 应不相等', () => {
    const p1 = Price.create(100, 'CNY');
    const p2 = Price.create(100, 'USD');
    expect(p1.equals(p2)).toBe(false);
  });

  it('不同 value 但相同 currency 应不相等', () => {
    const p1 = Price.create(100, 'CNY');
    const p2 = Price.create(200, 'CNY');
    expect(p1.equals(p2)).toBe(false);
  });

  it('默认货币应与显式 CNY 相等', () => {
    const p1 = Price.create(100);
    const p2 = Price.create(100, 'CNY');
    expect(p1.equals(p2)).toBe(true);
  });

  it('0 价格应与 0 价格相等', () => {
    const p1 = Price.create(0);
    const p2 = Price.create(0);
    expect(p1.equals(p2)).toBe(true);
  });

  it('浮点数精度内应相等', () => {
    const p1 = Price.create(1 / 3);
    const p2 = Price.create(1 / 3);
    expect(p1.equals(p2)).toBe(true);
  });
});

describe('Price 不变性', () => {
  it('value/currency 属性应通过 readonly 修饰符保护（编译时检查）', () => {
    const price = Price.create(100, 'USD');
    expect(price.value).toBe(100);
    expect(price.currency).toBe('USD');
    // 注：TypeScript 的 readonly 是编译时约束，运行时不强制。
    // 此处仅验证属性存在且可读，不可变性由 TS 编译器保证。
  });
});
