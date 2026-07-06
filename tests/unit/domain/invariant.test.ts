import { describe, it, expect } from 'vitest';
import { validatePortfolioInvariants } from '../../../packages/backend/src/domain/aggregates/portfolio.js';
import { Weight } from '../../../packages/backend/src/domain/value-objects/weight.js';
import { Price } from '../../../packages/backend/src/domain/value-objects/price.js';
import { invariant } from '../../../packages/backend/src/utils/invariant.js';

describe('invariant', () => {
  it('应该在不满足条件时抛出错误', () => {
    expect(() => invariant(false, 'test error')).toThrow('Invariant violation: test error');
  });

  it('应该在没有问题时通过', () => {
    expect(() => invariant(true, 'should not throw')).not.toThrow();
  });
});

describe('validatePortfolioInvariants', () => {
  it('权重总和 ~100 时应该通过', () => {
    const holdings = [
      { ticker: {} as any, weight: Weight.create(60) },
      { ticker: {} as any, weight: Weight.create(40) },
    ];
    expect(() => validatePortfolioInvariants({ holdings })).not.toThrow();
  });

  it('权重总和超出范围时应该抛出', () => {
    const holdings = [
      { ticker: {} as any, weight: Weight.create(70) },
      { ticker: {} as any, weight: Weight.create(40) },
    ];
    expect(() => validatePortfolioInvariants({ holdings })).toThrow('Invariant violation');
  });

  it('负权重时应该抛出', () => {
    const holdings = [{ ticker: {} as any, weight: { value: -10 } }];
    expect(() => validatePortfolioInvariants({ holdings })).toThrow('Invariant violation');
  });
});

describe('Price', () => {
  it('NaN 价格应该拒绝', () => {
    expect(() => Price.create(NaN)).toThrow('must be finite');
  });

  it('Infinity 价格应该拒绝', () => {
    expect(() => Price.create(Infinity)).toThrow('must be finite');
  });

  it('正常价格应该通过', () => {
    expect(() => Price.create(100)).not.toThrow();
  });
});
