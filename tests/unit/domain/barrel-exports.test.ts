/**
 * Domain 层 barrel export 冒烟测试
 *
 * 确保 index.ts 重导出路径可解析，避免 barrel 文件 0% 覆盖且运行时 import 失败。
 */
import { describe, it, expect } from 'vitest';
import { Portfolio } from '../../../packages/backend/src/domain/aggregates/index.js';
import {
  Ticker,
  Price,
  DateRange,
  Weight,
} from '../../../packages/backend/src/domain/value-objects/index.js';
import * as domain from '../../../packages/backend/src/domain/index.js';

describe('domain barrel exports', () => {
  it('aggregates/index 应导出 Portfolio', () => {
    const p = Portfolio.create('p1', 'Test', [
      { ticker: Ticker.create('AAPL'), weight: Weight.create(100) },
    ]);
    expect(p.id).toBe('p1');
  });

  it('value-objects/index 应导出全部值对象', () => {
    expect(Ticker.create('AAPL').value).toBe('AAPL');
    expect(Price.create(100).value).toBe(100);
    const range = DateRange.create(new Date('2020-01-01'), new Date('2020-12-31'));
    expect(range.start.getFullYear()).toBe(2020);
    expect(Weight.create(50).value).toBe(50);
  });

  it('domain/index 应聚合导出 aggregates 与 value-objects', () => {
    expect(domain.Portfolio).toBe(Portfolio);
    expect(domain.Ticker).toBe(Ticker);
    expect(domain.Price).toBe(Price);
    expect(domain.DateRange).toBe(DateRange);
    expect(domain.Weight).toBe(Weight);
  });
});
