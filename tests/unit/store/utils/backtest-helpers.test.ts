import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../packages/frontend/src/i18n/index.js', () => ({
  default: { t: (key: string, opts?: Record<string, unknown>) => (opts ? key : key) },
}));

import {
  extractApiErrorDetail,
  normalizeBacktestResult,
  validatePortfolios,
  createDefaultPortfolio,
  defaultParameters,
} from '../../../../packages/frontend/src/store/backtestHelpers.js';

describe('extractApiErrorDetail', () => {
  it('null/undefined 应返回 fallback', () => {
    expect(extractApiErrorDetail(null)).toBe('backtest.runFailed');
    expect(extractApiErrorDetail(undefined)).toBe('backtest.runFailed');
  });

  it('字符串 detail 应被提取', () => {
    expect(extractApiErrorDetail({ detail: '余额不足' })).toBe('余额不足');
  });

  it('字符串 error 应被提取', () => {
    expect(extractApiErrorDetail({ error: '服务器错误' })).toBe('服务器错误');
  });

  it('嵌套 error.detail 应被提取', () => {
    expect(extractApiErrorDetail({ error: { detail: '参数无效' } })).toBe('参数无效');
  });

  it('非对象应返回 fallback', () => {
    expect(extractApiErrorDetail('plain string')).toBe('backtest.runFailed');
    expect(extractApiErrorDetail(42)).toBe('backtest.runFailed');
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

describe('validatePortfolios', () => {
  it('空 ticker 应返回警告', () => {
    const portfolios = [
      createDefaultPortfolio(1),
      {
        id: 'p2',
        name: 'Bad Portfolio',
        assets: [{ id: 'a1', ticker: '  ', weight: 100 }],
        rebalanceFrequency: 'quarterly' as const,
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ];
    expect(validatePortfolios(portfolios)).toBe('backtest.emptyTickerWarning');
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
        totalReturn: true,
      },
    ];
    expect(validatePortfolios(portfolios)).toBe('backtest.weightSumWarning');
  });

  it('有效的投资组合应返回 null', () => {
    const portfolios = [
      {
        id: 'p1',
        name: 'Valid',
        assets: [
          { id: 'a1', ticker: 'VTI', weight: 60 },
          { id: 'a2', ticker: 'BND', weight: 40 },
        ],
        rebalanceFrequency: 'quarterly' as const,
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ];
    expect(validatePortfolios(portfolios)).toBeNull();
  });
});

describe('createDefaultPortfolio', () => {
  it('应创建包含 VTI/BND 组合的投资组合', () => {
    const p = createDefaultPortfolio(1);
    expect(p.name).toBe('Portfolio 1');
    expect(p.assets).toHaveLength(2);
    expect(p.assets[0].ticker).toBe('VTI');
    expect(p.assets[0].weight).toBe(60);
    expect(p.assets[1].ticker).toBe('BND');
    expect(p.assets[1].weight).toBe(40);
    expect(p.rebalanceFrequency).toBe('quarterly');
  });

  it('每次调用应生成唯一 ID', () => {
    const p1 = createDefaultPortfolio(1);
    const p2 = createDefaultPortfolio(2);
    expect(p1.id).not.toBe(p2.id);
  });
});

describe('defaultParameters', () => {
  it('应包含标准默认值', () => {
    expect(defaultParameters.startDate).toBe('2010-01-01');
    expect(defaultParameters.endDate).toBe('2024-12-31');
    expect(defaultParameters.startingValue).toBe(10000);
    expect(defaultParameters.baseCurrency).toBe('usd');
    expect(defaultParameters.benchmarkTicker).toBe('SPY');
    expect(defaultParameters.rebalanceFrequency).toBeUndefined();
  });
});
