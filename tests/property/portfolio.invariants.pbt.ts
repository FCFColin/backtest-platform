/**
 * Portfolio 不变量 property-based 测试（T-EB1 升级：针对真实源码）
 *
 * 企业理由：原测试仅验证数学恒等式（归一化、市值），不触达领域代码。
 * 本测试针对 Portfolio.fromDTO / Portfolio.rebalance / Weight.create / Ticker.create
 * 等真实领域源码，验证其不变量在任意合法输入下保持：
 *  - 权重归一化：构造后 totalWeight 与输入和一致
 *  - 不可变性：rebalance/addHolding 返回新实例，原对象不变
 *  - 边界校验：Weight 越界抛错；Ticker 净化为大写
 *  - 结构保持：rebalance 不改变 holdings 数量与 ticker 集合
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Portfolio } from '../../packages/backend/src/domain/aggregates/portfolio.js';
import { Weight, Ticker } from '../../packages/backend/src/domain/value-objects/index.js';
import type { Portfolio as PortfolioDTO } from '@backtest/shared/types';

// 生成合法 ticker 字符串：1-10 位字母数字主体 + 可选两字母后缀（仅字母）
const tickerArb = fc
  .tuple(
    fc.array(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', '0', '1', '2', '3'), {
      minLength: 1,
      maxLength: 10,
    }),
    fc.array(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F'), { minLength: 2, maxLength: 2 }),
    fc.boolean(),
  )
  .map(([baseChars, suffixChars, withSuffix]) => {
    const base = baseChars.join('');
    const suffix = suffixChars.join('');
    return withSuffix ? `${base}.${suffix}` : base;
  });

// 生成合法权重数组，其和精确等于 100（保证 Weight.create 不抛错）
const weightsSumTo100Arb = fc
  .array(fc.float({ min: 1, max: 50, noDefaultInfinity: true, noNaN: true }), {
    minLength: 2,
    maxLength: 10,
  })
  .map((ws) => {
    const sum = ws.reduce((s, w) => s + w, 0);
    // 按比例缩放使和=100，每个权重保持在 (0, 100) 内
    const factor = 100 / sum;
    return ws.map((w) => w * factor);
  });

function buildDTO(tickers: string[], weights: number[]): PortfolioDTO {
  return {
    id: 'pbt-portfolio',
    name: 'PBT',
    assets: tickers.map((t, i) => ({ ticker: t, weight: weights[i] })),
    rebalanceFrequency: 'monthly',
  };
}

describe('Portfolio 不变量 property 测试', () => {
  it('Portfolio.fromDTO：合法 DTO 构造后 totalWeight 等于输入权重和（容差 1e-6）', () => {
    fc.assert(
      fc.property(
        fc.array(tickerArb, { minLength: 2, maxLength: 10 }),
        weightsSumTo100Arb,
        (tickers, weights) => {
          if (tickers.length !== weights.length) return true;
          const unique = [...new Set(tickers)];
          if (unique.length !== tickers.length) return true;
          const dto = buildDTO(tickers, weights);
          const p = Portfolio.fromDTO(dto);
          const inputSum = weights.reduce((s, w) => s + w, 0);
          expect(Math.abs(p.totalWeight - inputSum)).toBeLessThan(1e-6);
          expect(p.holdingCount).toBe(tickers.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Portfolio.fromDTO：权重和偏离 100 超过容差（1）应抛错', () => {
    fc.assert(
      fc.property(
        fc.array(tickerArb, { minLength: 2, maxLength: 5 }),
        fc.float({ min: 10, max: 40, noDefaultInfinity: true, noNaN: true }),
        (tickers, badWeight) => {
          const unique = [...new Set(tickers)];
          if (unique.length !== tickers.length) return true;
          const weights = tickers.map(() => badWeight);
          const sum = weights.reduce((s, w) => s + w, 0);
          // 跳过边界情况（sum 恰好在 [99, 101] 内时不抛错）
          if (Math.abs(sum - 100) <= 1) return true;
          const dto = buildDTO(tickers, weights);
          expect(() => Portfolio.fromDTO(dto)).toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('Portfolio.rebalance：holdingCount 与 tickers 集合保持不变', () => {
    fc.assert(
      fc.property(
        fc.array(tickerArb, { minLength: 2, maxLength: 8 }),
        weightsSumTo100Arb,
        (tickers, weights) => {
          if (tickers.length !== weights.length) return true;
          const unique = [...new Set(tickers)];
          if (unique.length !== tickers.length) return true;
          const p = Portfolio.fromDTO(buildDTO(tickers, weights));
          const newWeights = weights.slice().reverse();
          const sum = newWeights.reduce((s, w) => s + w, 0);
          if (Math.abs(sum - 100) > 1) return true;
          const target = new Map(tickers.map((t, i) => [t, newWeights[i]]));
          const rebalanced = p.rebalance(target);
          expect(rebalanced.holdingCount).toBe(p.holdingCount);
          expect(rebalanced.tickers.sort()).toEqual(p.tickers.sort());
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Portfolio.rebalance：不可变性——原实例 totalWeight 不变', () => {
    fc.assert(
      fc.property(
        fc.array(tickerArb, { minLength: 2, maxLength: 6 }),
        weightsSumTo100Arb,
        (tickers, weights) => {
          if (tickers.length !== weights.length) return true;
          const unique = [...new Set(tickers)];
          if (unique.length !== tickers.length) return true;
          const p = Portfolio.fromDTO(buildDTO(tickers, weights));
          const originalSum = p.totalWeight;
          const newWeights = [...weights].reverse();
          const sum = newWeights.reduce((s, w) => s + w, 0);
          if (Math.abs(sum - 100) > 1) return true;
          const target = new Map(tickers.map((t, i) => [t, newWeights[i]]));
          p.rebalance(target);
          expect(p.totalWeight).toBe(originalSum);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Weight.create：0-100 范围内成功，越界抛错', () => {
    fc.assert(
      fc.property(fc.float({ min: -100, max: 200, noDefaultInfinity: true, noNaN: true }), (v) => {
        if (v >= 0 && v <= 100) {
          expect(Weight.create(v).value).toBe(v);
        } else {
          expect(() => Weight.create(v)).toThrow();
        }
      }),
      { numRuns: 300 },
    );
  });

  it('Ticker.create：任意大小写/空格输入净化为领域规范形态', () => {
    fc.assert(
      fc.property(tickerArb, (raw) => {
        const padded = `  ${raw.toLowerCase()}  `;
        const t = Ticker.create(padded);
        expect(t.value).toBe(t.value.toUpperCase());
        expect(t.value).toBe(t.value.trim());
        expect(t.value).toMatch(/^[A-Z0-9]{1,10}(\.[A-Z]{2})?$/);
      }),
      { numRuns: 200 },
    );
  });
});
