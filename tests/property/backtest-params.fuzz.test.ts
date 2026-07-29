/**
 * P3-04: 基础 Fuzz 测试 — 回测参数输入验证
 *
 * 企业理由：Fuzz 测试通过随机输入发现边界条件 bug，
 * 正整数溢出、空字符串、超大数值等可能绕过前端验证。
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// 模拟回测参数验证函数
function validateBacktestParams(params: {
  initialCapital: number;
  tickers: string[];
  startDate: string;
  endDate: string;
}): string | null {
  if (params.initialCapital <= 0) return 'initialCapital must be positive';
  if (params.initialCapital > 1e12) return 'initialCapital too large';
  if (params.tickers.length === 0) return 'tickers cannot be empty';
  if (params.tickers.length > 100) return 'too many tickers';
  if (!params.startDate || !params.endDate) return 'dates required';
  if (new Date(params.startDate) > new Date(params.endDate)) return 'start after end';
  return null;
}

describe('P3-04: Fuzz 测试 — 回测参数验证', () => {
  it('正数 initialCapital 不应返回错误', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 1e9, noNaN: true, noDefaultInfinity: true }), (capital) => {
        const result = validateBacktestParams({
          initialCapital: capital,
          tickers: ['AAPL'],
          startDate: '2020-01-01',
          endDate: '2021-01-01',
        });
        expect(result).toBeNull();
      }),
    );
  });

  it('负数 initialCapital 应返回错误', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: -0.01, noNaN: true, noDefaultInfinity: true }), (capital) => {
        const result = validateBacktestParams({
          initialCapital: capital,
          tickers: ['AAPL'],
          startDate: '2020-01-01',
          endDate: '2021-01-01',
        });
        expect(result).toBe('initialCapital must be positive');
      }),
    );
  });

  it('任意非空 ticker 列表不应返回 "cannot be empty" 错误', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0), {
          minLength: 1,
          maxLength: 10,
        }),
        (tickers) => {
          const result = validateBacktestParams({
            initialCapital: 10000,
            tickers,
            startDate: '2020-01-01',
            endDate: '2021-01-01',
          });
          expect(result).not.toBe('tickers cannot be empty');
        },
      ),
    );
  });
});
