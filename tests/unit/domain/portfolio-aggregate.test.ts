import { describe, it, expect } from 'vitest';
import { Portfolio } from '../../../packages/backend/src/domain/aggregates/portfolio.js';
import { Ticker, Weight } from '../../../packages/backend/src/domain/value-objects/index.js';

function makeHolding(ticker: string, weight: number) {
  return { ticker: Ticker.create(ticker), weight: Weight.create(weight) };
}

describe('Portfolio Aggregate', () => {
  describe('create', () => {
    it('权重和为 100 时创建成功', () => {
      const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
      expect(p.holdingCount).toBe(2);
    });

    it('权重和偏差超过容差时抛出错误', () => {
      expect(() => Portfolio.create('p1', 'Test', [makeHolding('AAPL', 50)])).toThrow(
        'weights must sum to ~100',
      );
    });
  });

  describe('properties', () => {
    const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);

    it('holdingCount 返回持仓数量', () => {
      expect(p.holdingCount).toBe(2);
    });

    it('tickers 返回所有 ticker 值列表', () => {
      expect(p.tickers).toEqual(['AAPL', 'SPY']);
    });

    it('totalWeight 返回权重总和', () => {
      expect(p.totalWeight).toBe(100);
    });

    it('maxWeight 返回最大持仓权重', () => {
      expect(p.maxWeight).toBe(60);
    });
  });
});
