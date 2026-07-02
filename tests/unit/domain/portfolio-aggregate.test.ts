/**
 * Portfolio Aggregate 单元测试（百分比权重和 ≈100，T-30）
 */
import { describe, it, expect } from 'vitest';
import { Portfolio } from '../../../api/domain/aggregates/portfolio.js';
import { Ticker } from '../../../api/domain/value-objects/ticker.js';
import { Weight } from '../../../api/domain/value-objects/weight.js';

function makeHolding(ticker: string, weight: number) {
  return {
    ticker: Ticker.create(ticker),
    weight: Weight.create(weight),
  };
}

describe('Portfolio.create', () => {
  it('单资产 100% 应成功', () => {
    const portfolio = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 100)]);
    expect(portfolio.getHoldings()).toHaveLength(1);
  });

  it('两资产各 50% 应成功', () => {
    const portfolio = Portfolio.create('p1', 'Test', [
      makeHolding('AAPL', 50),
      makeHolding('MSFT', 50),
    ]);
    expect(portfolio.getHoldings()).toHaveLength(2);
  });

  it('权重和 99% 在容差内应成功', () => {
    const portfolio = Portfolio.create('p1', 'Test', [
      makeHolding('AAPL', 49.5),
      makeHolding('MSFT', 49.5),
    ]);
    expect(portfolio.getHoldings()).toHaveLength(2);
  });

  it('空 holdings 应抛错', () => {
    expect(() => Portfolio.create('p1', 'Test', [])).toThrow(/sum to ~100/);
  });

  it('权重和 50% 应抛错', () => {
    expect(() => Portfolio.create('p1', 'Test', [makeHolding('AAPL', 50)])).toThrow(/sum to ~100/);
  });

  it('权重和 150% 应抛错', () => {
    expect(() =>
      Portfolio.create('p1', 'Test', [makeHolding('AAPL', 75), makeHolding('MSFT', 75)]),
    ).toThrow(/sum to ~100/);
  });
});

describe('Portfolio immutability', () => {
  it('addHolding 返回新实例', () => {
    const portfolio = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 100)]);
    const next = portfolio.addHolding(makeHolding('MSFT', 0));
    expect(next).not.toBe(portfolio);
    expect(next.getHoldings()).toHaveLength(2);
  });

  it('removeHolding 返回新实例', () => {
    const portfolio = Portfolio.create('p1', 'Test', [
      makeHolding('AAPL', 100),
      makeHolding('MSFT', 0),
    ]);
    const next = portfolio.removeHolding(Ticker.create('MSFT'));
    expect(next.getHoldings()).toHaveLength(1);
  });
});
