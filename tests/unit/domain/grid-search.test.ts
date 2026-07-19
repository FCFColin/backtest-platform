/**
 * grid-search 领域逻辑单元测试
 *
 * 覆盖参数校验、参数值生成、组合计数与上限检查。
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_GRID_COMBINATIONS,
  validateGridSearchRequest,
  generateParamValues,
  countCombinations,
  isWithinCombinationLimit,
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

describe('generateParamValues', () => {
  it('步长为正时生成等差数列', () => {
    expect(generateParamValues({ min: 2, max: 10, step: 2 })).toEqual([2, 4, 6, 8, 10]);
  });

  it('步长为零时只返回最小值', () => {
    expect(generateParamValues({ min: 5, max: 5, step: 0 })).toEqual([5]);
  });

  it('浮点步长正确取整', () => {
    expect(generateParamValues({ min: 0, max: 0.03, step: 0.01 })).toEqual([0, 0.01, 0.02, 0.03]);
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

describe('isWithinCombinationLimit', () => {
  it('组合数在上限内返回 true', () => {
    expect(
      isWithinCombinationLimit({ min: 2, max: 10, step: 2 }, { min: 5, max: 25, step: 5 }),
    ).toBe(true);
  });

  it('组合数超过上限返回 false', () => {
    expect(
      isWithinCombinationLimit(
        { min: 1, max: MAX_GRID_COMBINATIONS, step: 1 },
        { min: 1, max: 5, step: 1 },
      ),
    ).toBe(false);
  });
});
