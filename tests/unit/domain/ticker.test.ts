/**
 * Ticker Value Object 单元测试
 *
 * 企业理由：Ticker 是系统核心值对象，校验失败会导致路径遍历、
 * 命令注入等安全漏洞。测试覆盖：
 * - 合法 ticker 创建成功
 * - 非法字符抛错
 * - 大小写归一化（输入小写转为大写）
 * - 相等性比较
 * - toString 方法
 */

import { describe, it, expect } from 'vitest';
import { Ticker } from '../../../packages/backend/src/domain/value-objects/ticker.js';

describe('Ticker.create', () => {
  describe('合法 ticker', () => {
    it.each([
      ['AAPL', 'AAPL', '美股代码'],
      ['MSFT', 'MSFT', '美股代码'],
      ['VTI', 'VTI', 'ETF 代码'],
      ['A', 'A', '单字符'],
      ['ABCDE', 'ABCDE', '5 字符'],
      ['ABCDEFGHIJ', 'ABCDEFGHIJ', '10 字符（上限）'],
      ['123', '123', '数字代码'],
      ['A1B2', 'A1B2', '字母数字混合'],
      ['510300.SS', '510300.SS', 'A 股带后缀'],
      ['600519.SH', '600519.SH', '沪市后缀'],
      ['000001.SZ', '000001.SZ', '深市后缀'],
    ])('应接受 %s（%s）', (input, expected) => {
      const ticker = Ticker.create(input);
      expect(ticker.value).toBe(expected);
    });

    it('应将小写转为大写（大小写归一化）', () => {
      const ticker = Ticker.create('aapl');
      expect(ticker.value).toBe('AAPL');
    });

    it('应去除首尾空格', () => {
      const ticker = Ticker.create('  AAPL  ');
      expect(ticker.value).toBe('AAPL');
    });

    it('小写带后缀应转为大写带后缀', () => {
      const ticker = Ticker.create('510300.ss');
      expect(ticker.value).toBe('510300.SS');
    });
  });

  describe('非法 ticker', () => {
    it.each([
      ['AAPL!', '感叹号'],
      ['AAPL@', 'at 符号'],
      ['AAPL#', '井号'],
      ['AA PL', '中间空格'],
      ['中证500', '非 ASCII 字符'],
      ['AAPL.BCD', '后缀超过 2 字符'],
      ['AAPL.', '后缀为空'],
      ['.SS', '主体为空'],
      ['AAPL-SZ', '连字符非法'],
      ['AAPL_SS', '下划线非法'],
    ])('应拒绝 %s（%s）', (input) => {
      expect(() => Ticker.create(input)).toThrow(/Invalid ticker/);
    });

    it('应拒绝超过 10 字符的 ticker（不含后缀）', () => {
      expect(() => Ticker.create('ABCDEFGHIJK')).toThrow(/Invalid ticker/);
    });

    it('应拒绝空字符串', () => {
      expect(() => Ticker.create('')).toThrow(/Invalid ticker/);
    });

    it('应拒绝仅含空格的字符串（trim 后为空）', () => {
      expect(() => Ticker.create('   ')).toThrow(/Invalid ticker/);
    });

    // 注：'AAPL ' 和 ' AAPL' 在 trim 后变为 'AAPL'，是合法的
    // 这是 Ticker.create 的归一化行为（先 trim 再校验）
    it('尾随空格应在 trim 后通过校验（归一化行为）', () => {
      const ticker = Ticker.create('AAPL ');
      expect(ticker.value).toBe('AAPL');
    });

    it('前导空格应在 trim 后通过校验（归一化行为）', () => {
      const ticker = Ticker.create(' AAPL');
      expect(ticker.value).toBe('AAPL');
    });
  });
});

describe('Ticker.equals', () => {
  it('相同 value 应相等', () => {
    const t1 = Ticker.create('AAPL');
    const t2 = Ticker.create('AAPL');
    expect(t1.equals(t2)).toBe(true);
  });

  it('不同 value 应不相等', () => {
    const t1 = Ticker.create('AAPL');
    const t2 = Ticker.create('MSFT');
    expect(t1.equals(t2)).toBe(false);
  });

  it('大小写不同的输入应相等（归一化后比较）', () => {
    const t1 = Ticker.create('AAPL');
    const t2 = Ticker.create('aapl');
    expect(t1.equals(t2)).toBe(true);
  });

  it('带后缀的相同 ticker 应相等', () => {
    const t1 = Ticker.create('510300.SS');
    const t2 = Ticker.create('510300.SS');
    expect(t1.equals(t2)).toBe(true);
  });

  it('带后缀的不同 ticker 应不相等', () => {
    const t1 = Ticker.create('510300.SS');
    const t2 = Ticker.create('510300.SZ');
    expect(t1.equals(t2)).toBe(false);
  });
});

describe('Ticker.toString', () => {
  it('应返回 value 字符串', () => {
    const ticker = Ticker.create('AAPL');
    expect(ticker.toString()).toBe('AAPL');
  });

  it('带后缀的 ticker 应返回完整字符串', () => {
    const ticker = Ticker.create('510300.SS');
    expect(ticker.toString()).toBe('510300.SS');
  });

  it('小写输入应返回大写字符串', () => {
    const ticker = Ticker.create('msft');
    expect(ticker.toString()).toBe('MSFT');
  });
});

describe('Ticker 不变性', () => {
  it('value 属性应通过 readonly 修饰符保护（编译时检查）', () => {
    const ticker = Ticker.create('AAPL');
    expect(ticker.value).toBe('AAPL');
    // 注：TypeScript 的 readonly 是编译时约束，运行时不强制。
    // 此处仅验证 value 属性存在且可读，不可变性由 TS 编译器保证。
  });
});
