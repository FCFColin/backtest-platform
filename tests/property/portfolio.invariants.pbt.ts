import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Portfolio } from '../../packages/backend/src/domain/aggregates/portfolio.js';
import { Weight, Ticker } from '../../packages/backend/src/domain/value-objects/index.js';
import type { Portfolio as PortfolioDTO } from '@backtest/shared/types';

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

const weightsSumTo100Arb = fc
  .array(fc.float({ min: 1, max: 50, noDefaultInfinity: true, noNaN: true }), {
    minLength: 2,
    maxLength: 10,
  })
  .map((ws) => {
    const sum = ws.reduce((s, w) => s + w, 0);
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
          if (Math.abs(sum - 100) <= 1) return true;
          const dto = buildDTO(tickers, weights);
          expect(() => Portfolio.fromDTO(dto)).toThrow();
        },
      ),
      { numRuns: 50 },
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
