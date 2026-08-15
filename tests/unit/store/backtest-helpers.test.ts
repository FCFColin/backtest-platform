import { describe, it, expect, vi } from 'vitest';

vi.mock(
  '../../../packages/frontend/src/i18n/index.js',
  async () => (await import('../../helpers/i18nMock.js')).i18nIndexModuleMock,
);

import {
  extractApiErrorDetail,
  normalizeBacktestResult,
  validatePortfolios,
  defaultParameters,
} from '../../../packages/frontend/src/store/backtestHelpers.js';

describe('extractApiErrorDetail', () => {
  it.each([
    ['null', null, 'Backtest failed. Please check ticker symbols and parameters.'],
    ['undefined', undefined, 'Backtest failed. Please check ticker symbols and parameters.'],
    ['纯字符串', 'plain string', 'Backtest failed. Please check ticker symbols and parameters.'],
    ['数字', 42, 'Backtest failed. Please check ticker symbols and parameters.'],
    ['字符串 detail', { detail: '余额不足' }, '余额不足'],
    ['字符串 error', { error: '服务器错误' }, '服务器错误'],
    ['嵌套 error.detail', { error: { detail: '参数无效' } }, '参数无效'],
    ['detail 优先于 error', { detail: '优先', error: '忽略' }, '优先'],
  ])('%s 应返回 %p', (_label, input, expected) => {
    expect(extractApiErrorDetail(input)).toBe(expected);
  });
});

describe('normalizeBacktestResult', () => {
  it('应使用空数组和空对象填充缺失字段', () => {
    const result = normalizeBacktestResult({});
    expect(result.portfolios).toEqual([]);
    expect(result.correlations).toEqual([]);
    expect(result.assetTickers).toEqual([]);
    expect(result.assetCorrelations).toEqual([]);
    expect(result.benchmarkGrowth).toEqual([]);
  });

  it('应保留已有数据并填充缺失的子字段', () => {
    const raw = {
      portfolios: [
        {
          name: 'Test Portfolio',
          growthCurve: [100, 110],
          statistics: { cagr: 0.08 },
        },
      ],
    };
    const result = normalizeBacktestResult(raw);
    expect(result.portfolios).toHaveLength(1);
    expect(result.portfolios[0].name).toBe('Test Portfolio');
    expect(result.portfolios[0].growthCurve).toEqual([100, 110]);
    expect(result.portfolios[0].drawdownCurve).toEqual([]);
    expect(result.portfolios[0].statistics).toEqual({ cagr: 0.08 });
  });

  it('应处理 null/undefined 输入', () => {
    const result = normalizeBacktestResult(null);
    expect(result.portfolios).toEqual([]);
  });
});

const validPortfolio = {
  id: 'p1',
  name: 'Valid',
  assets: [
    { id: 'a1', ticker: 'VTI', weight: 60 },
    { id: 'a2', ticker: 'BND', weight: 40 },
  ],
  rebalanceFrequency: 'quarterly' as const,
  rebalanceOffset: 0,
  drag: 0,
};

describe('validatePortfolios', () => {
  it('空 ticker 应返回警告', () => {
    const portfolios = [
      validPortfolio,
      {
        id: 'p2',
        name: 'Bad Portfolio',
        assets: [{ id: 'a1', ticker: '  ', weight: 100 }],
        rebalanceFrequency: 'quarterly' as const,
        rebalanceOffset: 0,
        drag: 0,
      },
    ];
    expect(validatePortfolios(portfolios)).toBe(
      'Some ticker symbols are empty. Please fill them in before running.',
    );
  });

  it('权重和不等于 100 应返回警告', () => {
    const portfolios = [
      {
        id: 'p1',
        name: 'Bad Weight',
        assets: [
          { id: 'a1', ticker: 'VTI', weight: 50 },
          { id: 'a2', ticker: 'BND', weight: 30 },
        ],
        rebalanceFrequency: 'quarterly' as const,
        rebalanceOffset: 0,
        drag: 0,
      },
    ];
    expect(validatePortfolios(portfolios)).toBe('Bad Weight weights sum to 80.00%, should be 100%');
  });

  it('有效的投资组合应返回 null', () => {
    expect(validatePortfolios([validPortfolio])).toBeNull();
  });
});

describe('defaultParameters', () => {
  it('应包含标准默认值', () => {
    expect(defaultParameters.startDate).toBe('2010-01-01');
    expect(defaultParameters.endDate).toBe(new Date().toLocaleDateString('en-CA'));
    expect(defaultParameters.startingValue).toBe(10000);
    expect(defaultParameters.baseCurrency).toBe('usd');
    expect(defaultParameters.benchmarkTicker).toBe('SPY');
    expect(defaultParameters.rebalanceFrequency).toBeUndefined();
  });
});
