/**
 * Domain 层 barrel export 冒烟测试
 *
 * 确保 index.ts 重导出路径可解析，避免 barrel 文件 0% 覆盖且运行时 import 失败。
 */
import { describe, it, expect } from 'vitest';
import { Portfolio } from '../../../packages/backend/src/domain/aggregates/portfolio.js';
import { Ticker } from '../../../packages/backend/src/domain/value-objects/ticker.js';
import { Weight } from '../../../packages/backend/src/domain/value-objects/weight.js';
import * as domain from '../../../packages/backend/src/domain/index.js';

describe('domain barrel exports', () => {
  it('Portfolio 应正确创建', () => {
    const p = Portfolio.create('p1', 'Test', [
      { ticker: Ticker.create('AAPL'), weight: Weight.create(100) },
    ]);
    expect(p.id).toBe('p1');
  });

  it('Ticker/Weight 值对象', () => {
    expect(Ticker.create('AAPL').value).toBe('AAPL');
    expect(Weight.create(50).value).toBe(50);
  });

  it('domain/index 应聚合导出', () => {
    expect(domain.Portfolio).toBe(Portfolio);
    expect(domain.Ticker).toBe(Ticker);
    expect(domain.Weight).toBe(Weight);
  });
});
