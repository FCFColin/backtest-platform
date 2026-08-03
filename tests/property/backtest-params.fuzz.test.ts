import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { portfolioBacktestSchema } from '../../packages/backend/src/schemas/backtest.js';

const validAsset = { ticker: 'AAPL', weight: 100 };
const validParams = { startDate: '2020-01-01', endDate: '2021-01-01' };

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    portfolios: [{ assets: [validAsset], rebalanceFrequency: 'monthly' }],
    parameters: validParams,
    ...overrides,
  };
}

describe('P3-04: Fuzz 测试 — 回测参数验证（真实 Zod validator）', () => {
  it('合法参数应始终通过校验', () => {
    fc.assert(
      fc.property(
        fc.record({
          weight: fc.float({ min: 99.5, max: 100.5, noDefaultInfinity: true, noNaN: true }),
          startDate: fc.constant('2020-01-01'),
          endDate: fc.constant('2021-01-01'),
          freq: fc.constantFrom('monthly', 'quarterly', 'annual', 'weekly', 'daily', 'none'),
        }),
        ({ weight, startDate, endDate, freq }) => {
          const result = portfolioBacktestSchema.safeParse({
            portfolios: [{ assets: [{ ticker: 'AAPL', weight }], rebalanceFrequency: freq }],
            parameters: { startDate, endDate },
          });
          expect(result.success).toBe(true);
        },
      ),
    );
  });

  it('权重和不为 100（±1）时应拒绝', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 50, noDefaultInfinity: true, noNaN: true }),
        fc.float({ min: 0, max: 50, noDefaultInfinity: true, noNaN: true }),
        (w1, w2) => {
          const sum = w1 + w2;
          fc.pre(Math.abs(sum - 100) > 1);
          const result = portfolioBacktestSchema.safeParse(
            makeBody({
              portfolios: [
                {
                  assets: [
                    { ticker: 'A', weight: w1 },
                    { ticker: 'B', weight: w2 },
                  ],
                  rebalanceFrequency: 'monthly',
                },
              ],
            }),
          );
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('startDate > endDate 时应拒绝', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        (d1, d2) => {
          fc.pre(d1 > d2);
          const result = portfolioBacktestSchema.safeParse(
            makeBody({ parameters: { startDate: d1, endDate: d2 } }),
          );
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('空 portfolios 数组应拒绝', () => {
    expect(
      portfolioBacktestSchema.safeParse({ portfolios: [], parameters: validParams }).success,
    ).toBe(false);
  });

  it('缺少 parameters 应拒绝', () => {
    expect(
      portfolioBacktestSchema.safeParse({
        portfolios: [{ assets: [validAsset], rebalanceFrequency: 'monthly' }],
      }).success,
    ).toBe(false);
  });

  it('非法 rebalanceFrequency 应拒绝', () => {
    fc.assert(
      fc.property(
        fc
          .string()
          .filter(
            (s) => !['monthly', 'quarterly', 'annual', 'weekly', 'daily', 'none'].includes(s),
          ),
        (freq) => {
          const result = portfolioBacktestSchema.safeParse(
            makeBody({
              portfolios: [{ assets: [validAsset], rebalanceFrequency: freq }],
            }),
          );
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('非法日期格式应拒绝', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s)),
        (badDate) => {
          const result = portfolioBacktestSchema.safeParse(
            makeBody({ parameters: { startDate: badDate, endDate: '2021-01-01' } }),
          );
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('空 assets 数组应拒绝', () => {
    const result = portfolioBacktestSchema.safeParse({
      portfolios: [{ assets: [], rebalanceFrequency: 'monthly' }],
      parameters: validParams,
    });
    expect(result.success).toBe(false);
  });

  it('多资产合法组合应通过（权重和=100）', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            ticker: fc.stringMatching(/^[A-Z]{1,4}$/),
            weight: fc.float({ min: 1, max: 50, noNaN: true }),
          }),
          { minLength: 2, maxLength: 10 },
        ),
        (assets) => {
          const sum = assets.reduce((s, a) => s + a.weight, 0);
          const factor = 100 / sum;
          const normalized = assets.map((a) => ({ ...a, weight: a.weight * factor }));
          const result = portfolioBacktestSchema.safeParse({
            portfolios: [{ assets: normalized, rebalanceFrequency: 'monthly' }],
            parameters: validParams,
          });
          expect(result.success).toBe(true);
        },
      ),
    );
  });
});
