import { describe, it } from 'vitest';
import * as fc from 'fast-check';

describe('Portfolio weight invariants', () => {
  it('任意一组非负权重可标准化为总和 1', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 0, max: 1000, noDefaultInfinity: true, noNaN: true }), {
          minLength: 1,
          maxLength: 50,
        }),
        (weights) => {
          const total = weights.reduce((s, w) => s + w, 0);
          if (total === 0) return true;
          const normalized = weights.map((w) => w / total);
          const sum = normalized.reduce((s, w) => s + w, 0);
          return Math.abs(sum - 1) < 1e-10;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('价格 × 份额 = 正市值', () => {
    fc.assert(
      fc.property(
        fc.float({
          min: Math.fround(0.01),
          max: Math.fround(1_000_000),
          noDefaultInfinity: true,
          noNaN: true,
        }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (price, shares) => {
          const marketValue = price * shares;
          return marketValue > 0 && Number.isFinite(marketValue);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('日收益率在 [-1, ∞) 范围内', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.float({
            min: Math.fround(0.01),
            max: Math.fround(1_000_000),
            noDefaultInfinity: true,
            noNaN: true,
          }),
          { minLength: 2, maxLength: 252 },
        ),
        (prices) => {
          for (let i = 1; i < prices.length; i++) {
            const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
            if (ret < -1 || !Number.isFinite(ret)) return false;
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('再平衡后所有权重非负', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 0, max: 1, noDefaultInfinity: true, noNaN: true }), {
          minLength: 2,
          maxLength: 20,
        }),
        (weights) => {
          const total = weights.reduce((s, w) => s + w, 0);
          if (total === 0) return true;
          const targetWeights = weights.map((w) => w / total);
          return targetWeights.every((w) => w >= 0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
