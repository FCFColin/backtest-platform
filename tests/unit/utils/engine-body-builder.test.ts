/**
 * engineBodyBuilder 单元测试
 *
 * 企业理由：引擎请求体构造是 Node→Go 跨语言调用的契约层，
 * 字段映射错误会导致 Go 引擎计算错误结果或崩溃。测试覆盖：
 * - buildEnginePortfolioBody 正确映射基础字段
 * - rebalanceBands.enabled=false 时 bands 为 undefined
 * - rebalanceBands.enabled=true 时 bands 包含 absolute/relative
 * - isGlidepath=false 时 glidepath 字段为 undefined
 * - isGlidepath=true 时 glidepath 字段正确映射
 * - buildEngineParams 正确映射参数字段
 * - 可选字段缺失时使用默认值（extendedWithdrawalStats=false, cashflowLegs=[]）
 */

import { describe, it, expect } from 'vitest';
import {
  buildEnginePortfolioBody,
  buildEngineParams,
} from '../../../api/utils/engineBodyBuilder.js';
import type { Portfolio, BacktestParameters } from '../../../shared/types.js';

function makeBasePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 'p1',
    name: 'Test Portfolio',
    assets: [
      { ticker: 'AAPL', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'monthly',
    ...overrides,
  };
}

function makeBaseParams(overrides: Partial<BacktestParameters> = {}): BacktestParameters {
  return {
    startDate: '2020-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: 'SPY',
    ...overrides,
  };
}

describe('buildEnginePortfolioBody', () => {
  it('应正确映射基础字段（name/assets/rebalanceFrequency）', () => {
    const portfolio = makeBasePortfolio();
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.name).toBe('Test Portfolio');
    expect(body.assets).toEqual([
      { ticker: 'AAPL', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ]);
    expect(body.rebalanceFrequency).toBe('monthly');
  });

  it('应映射可选字段 rebalanceThreshold/rebalanceOffset/drag/totalReturn', () => {
    const portfolio = makeBasePortfolio({
      rebalanceThreshold: 5,
      rebalanceOffset: 1,
      drag: 0.5,
      totalReturn: true,
    });
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.rebalanceThreshold).toBe(5);
    expect(body.rebalanceOffset).toBe(1);
    expect(body.drag).toBe(0.5);
    expect(body.totalReturn).toBe(true);
  });

  it('可选字段未设置时应为 undefined', () => {
    const portfolio = makeBasePortfolio();
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.rebalanceThreshold).toBeUndefined();
    expect(body.rebalanceOffset).toBeUndefined();
    expect(body.drag).toBeUndefined();
    expect(body.totalReturn).toBeUndefined();
  });

  it('rebalanceBands.enabled=false 时应返回 undefined', () => {
    const portfolio = makeBasePortfolio({
      rebalanceBands: { enabled: false, absoluteBand: 5, relativeBand: 20 },
    });
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.rebalanceBands).toBeUndefined();
  });

  it('rebalanceBands.enabled=true 时应映射 absolute/relative', () => {
    const portfolio = makeBasePortfolio({
      rebalanceBands: { enabled: true, absoluteBand: 5, relativeBand: 20 },
    });
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.rebalanceBands).toEqual({
      absolute: 5,
      relative: 20,
    });
  });

  it('rebalanceBands 未设置时应为 undefined', () => {
    const portfolio = makeBasePortfolio();
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.rebalanceBands).toBeUndefined();
  });

  it('isGlidepath=false 时 glidepath 字段应为 undefined', () => {
    const portfolio = makeBasePortfolio({
      isGlidepath: false,
      glidepathToWeights: [0.5, 0.5],
      glidepathYears: 10,
    });
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.glidepathToWeights).toBeUndefined();
    expect(body.glidepathYears).toBeUndefined();
  });

  it('isGlidepath=true 时应映射 glidepathToWeights/glidepathYears', () => {
    const portfolio = makeBasePortfolio({
      isGlidepath: true,
      glidepathToWeights: [0.7, 0.3],
      glidepathYears: 15,
    });
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.glidepathToWeights).toEqual([0.7, 0.3]);
    expect(body.glidepathYears).toBe(15);
  });

  it('isGlidepath=true 但 glidepath 字段未设置时应为 undefined', () => {
    const portfolio = makeBasePortfolio({
      isGlidepath: true,
    });
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.glidepathToWeights).toBeUndefined();
    expect(body.glidepathYears).toBeUndefined();
  });

  it('空 assets 数组应正确映射', () => {
    const portfolio = makeBasePortfolio({
      assets: [],
    });
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.assets).toEqual([]);
  });

  it('单个 asset 应正确映射', () => {
    const portfolio = makeBasePortfolio({
      assets: [{ ticker: 'VTI', weight: 100 }],
    });
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.assets).toEqual([{ ticker: 'VTI', weight: 100 }]);
  });

  it('负权重（做空）应原样映射', () => {
    const portfolio = makeBasePortfolio({
      assets: [
        { ticker: 'LONG', weight: 150 },
        { ticker: 'SHORT', weight: -50 },
      ],
    });
    const body = buildEnginePortfolioBody(portfolio);

    expect(body.assets).toEqual([
      { ticker: 'LONG', weight: 150 },
      { ticker: 'SHORT', weight: -50 },
    ]);
  });
});

describe('buildEngineParams', () => {
  it('应正确映射所有必填字段', () => {
    const params = makeBaseParams();
    const body = buildEngineParams(params);

    expect(body.startDate).toBe('2020-01-01');
    expect(body.endDate).toBe('2024-12-31');
    expect(body.startingValue).toBe(10000);
    expect(body.adjustForInflation).toBe(false);
    expect(body.rollingWindowMonths).toBe(12);
    expect(body.benchmarkTicker).toBe('SPY');
  });

  it('引擎必填字段缺省时应使用契约默认值（startingValue=10000/adjustForInflation=false/rollingWindowMonths=12/benchmarkTicker=空）', () => {
    // 仅提供日期，模拟前端省略可选参数的场景。
    // 引擎 BacktestParams 将这些字段视为必填，缺省会导致 JSON 省略 → 引擎 400 → 降级。
    const params = { startDate: '2020-01-01', endDate: '2021-01-01' } as BacktestParameters;
    const body = buildEngineParams(params);

    expect(body.startingValue).toBe(10000);
    expect(body.adjustForInflation).toBe(false);
    expect(body.rollingWindowMonths).toBe(12);
    expect(body.benchmarkTicker).toBe('');
  });

  it('extendedWithdrawalStats 缺省时应默认为 false', () => {
    const params = makeBaseParams();
    const body = buildEngineParams(params);

    expect(body.extendedWithdrawalStats).toBe(false);
  });

  it('extendedWithdrawalStats=true 时应原样映射', () => {
    const params = makeBaseParams({ extendedWithdrawalStats: true });
    const body = buildEngineParams(params);

    expect(body.extendedWithdrawalStats).toBe(true);
  });

  it('cashflowLegs 缺省时应默认为空数组', () => {
    const params = makeBaseParams();
    const body = buildEngineParams(params);

    expect(body.cashflowLegs).toEqual([]);
  });

  it('cashflowLegs 设置时应原样映射', () => {
    const params = makeBaseParams({
      cashflowLegs: [
        {
          id: 'leg-1',
          amount: 1000,
          type: 'contribution',
          frequency: 'monthly',
          offset: 0,
        },
      ],
    });
    const body = buildEngineParams(params);

    expect(body.cashflowLegs).toHaveLength(1);
    expect(body.cashflowLegs[0].id).toBe('leg-1');
  });

  it('oneTimeCashflows 缺省时应默认为空数组', () => {
    const params = makeBaseParams();
    const body = buildEngineParams(params);

    expect(body.oneTimeCashflows).toEqual([]);
  });

  it('oneTimeCashflows 设置时应原样映射', () => {
    const params = makeBaseParams({
      oneTimeCashflows: [
        {
          id: 'cf-1',
          amount: 5000,
          type: 'withdrawal',
          date: '2024-06-15',
        },
      ],
    });
    const body = buildEngineParams(params);

    expect(body.oneTimeCashflows).toHaveLength(1);
    expect(body.oneTimeCashflows[0].id).toBe('cf-1');
  });

  it('所有可选字段同时设置时应全部正确映射', () => {
    const params = makeBaseParams({
      extendedWithdrawalStats: true,
      cashflowLegs: [
        { id: 'l1', amount: 100, type: 'contribution', frequency: 'yearly', offset: 0 },
      ],
      oneTimeCashflows: [{ id: 'o1', amount: 200, type: 'withdrawal', date: '2024-01-01' }],
    });
    const body = buildEngineParams(params);

    expect(body.extendedWithdrawalStats).toBe(true);
    expect(body.cashflowLegs).toHaveLength(1);
    expect(body.oneTimeCashflows).toHaveLength(1);
  });
});
