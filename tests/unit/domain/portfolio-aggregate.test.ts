/**
 * Portfolio 聚合根充血模型单元测试
 *
 * 覆盖：权重校验、持仓管理、集中度分析、再平衡逻辑。
 */
import { describe, it, expect } from 'vitest';
import {
  Portfolio,
  CONCENTRATION_THRESHOLD,
} from '../../../packages/backend/src/domain/aggregates/portfolio.js';
import { Ticker } from '../../../packages/backend/src/domain/value-objects/ticker.js';
import { Weight } from '../../../packages/backend/src/domain/value-objects/weight.js';

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

  describe('concentration', () => {
    it('最大持仓超过阈值时 isConcentrated 为 true', () => {
      const p = Portfolio.create('p1', 'Test', [
        makeHolding('AAPL', CONCENTRATION_THRESHOLD + 1),
        makeHolding('SPY', 100 - CONCENTRATION_THRESHOLD - 1),
      ]);
      expect(p.isConcentrated).toBe(true);
    });

    it('最大持仓未超过阈值时 isConcentrated 为 false', () => {
      const p = Portfolio.create('p1', 'Test', [
        makeHolding('AAPL', 35),
        makeHolding('SPY', 35),
        makeHolding('BND', 30),
      ]);
      expect(p.isConcentrated).toBe(false);
    });
  });

  describe('findHolding', () => {
    it('找到指定 ticker 的持仓', () => {
      const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
      const holding = p.findHolding(Ticker.create('AAPL'));
      expect(holding?.ticker.value).toBe('AAPL');
      expect(holding?.weight.value).toBe(60);
    });

    it('未找到时返回 undefined', () => {
      const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 100)]);
      expect(p.findHolding(Ticker.create('SPY'))).toBeUndefined();
    });
  });

  describe('addHolding', () => {
    it('添加持仓后权重和仍为 100 时成功（添加零权重持仓）', () => {
      const original = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 100)]);
      const updated = original.addHolding(makeHolding('SPY', 0));
      expect(original.holdingCount).toBe(1);
      expect(updated.holdingCount).toBe(2);
    });

    it('添加持仓导致权重和超限时抛出错误', () => {
      const original = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 100)]);
      expect(() => original.addHolding(makeHolding('SPY', 10))).toThrow('weights must sum to ~100');
    });
  });

  describe('removeHolding', () => {
    it('移除零权重持仓后权重和仍为 100', () => {
      const original = Portfolio.create('p1', 'Test', [
        makeHolding('AAPL', 100),
        makeHolding('SPY', 0),
      ]);
      const updated = original.removeHolding(Ticker.create('SPY'));
      expect(original.holdingCount).toBe(2);
      expect(updated.holdingCount).toBe(1);
    });

    it('移除非零持仓导致权重和不足时抛出错误', () => {
      const original = Portfolio.create('p1', 'Test', [
        makeHolding('AAPL', 60),
        makeHolding('SPY', 40),
      ]);
      expect(() => original.removeHolding(Ticker.create('SPY'))).toThrow(
        'weights must sum to ~100',
      );
    });
  });

  describe('rebalance', () => {
    it('按目标权重调整持仓', () => {
      const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
      const targets = new Map([
        ['AAPL', 50],
        ['SPY', 50],
      ]);
      const rebalanced = p.rebalance(targets);
      expect(rebalanced.findHolding(Ticker.create('AAPL'))?.weight.value).toBe(50);
      expect(rebalanced.findHolding(Ticker.create('SPY'))?.weight.value).toBe(50);
    });

    it('缺少目标权重时抛出错误', () => {
      const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
      const targets = new Map([['AAPL', 100]]);
      expect(() => p.rebalance(targets)).toThrow('No target weight for ticker: SPY');
    });
  });

  describe('needsRebalance', () => {
    it('偏离超过阈值时返回 true', () => {
      const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 60), makeHolding('SPY', 40)]);
      const targets = new Map([
        ['AAPL', 50],
        ['SPY', 50],
      ]);
      expect(p.needsRebalance(targets, 5)).toBe(true);
    });

    it('偏离未超过阈值时返回 false', () => {
      const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 55), makeHolding('SPY', 45)]);
      const targets = new Map([
        ['AAPL', 50],
        ['SPY', 50],
      ]);
      expect(p.needsRebalance(targets, 10)).toBe(false);
    });

    it('缺少目标权重时返回 true', () => {
      const p = Portfolio.create('p1', 'Test', [makeHolding('AAPL', 100)]);
      const targets = new Map<string, number>([]);
      expect(p.needsRebalance(targets, 5)).toBe(true);
    });
  });
});
