/**
 * grid-search 领域逻辑单元测试
 *
 * 覆盖参数校验、参数值生成、组合计数与上限检查。
 */
import { describe, it, expect } from 'vitest';
import {
  validateGridSearchRequest,
  countCombinations,
  type GridSearchDomainRequest,
} from '../../../packages/backend/src/domain/services/grid-search.js';

function validRequest(overrides: Partial<GridSearchDomainRequest> = {}): GridSearchDomainRequest {
  return {
    indicator: 'rsi',
    param1: { min: 2, max: 10, step: 2 },
    param2: { min: 5, max: 25, step: 5 },
    tickers: ['SPY'],
    startDate: '2020-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    rebalanceFrequency: 'monthly',
    objective: 'maxSharpe',
    ...overrides,
  };
}

describe('validateGridSearchRequest', () => {
  it('有效请求返回 null', () => {
    expect(validateGridSearchRequest(validRequest())).toBeNull();
  });

  it('缺少 indicator 返回错误', () => {
    expect(validateGridSearchRequest(validRequest({ indicator: '' }))).toContain('indicator');
  });

  it('空 tickers 返回错误', () => {
    expect(validateGridSearchRequest(validRequest({ tickers: [] }))).toContain('标的代码');
  });

  it('缺少日期返回错误', () => {
    expect(validateGridSearchRequest(validRequest({ startDate: '' }))).toContain('起止日期');
  });
});

describe('countCombinations', () => {
  it('返回两个参数范围的笛卡尔积大小', () => {
    expect(countCombinations({ min: 2, max: 10, step: 2 }, { min: 5, max: 25, step: 5 })).toBe(25);
  });

  it('步长为零时只算 1 个值', () => {
    expect(countCombinations({ min: 5, max: 5, step: 0 }, { min: 5, max: 5, step: 0 })).toBe(1);
  });
});
