import { describe, it, expect } from 'vitest';
import { buildEngineParams } from '../../../packages/backend/src/application/backtest/engineBodyBuilder.js';
import { Portfolio } from '../../../packages/backend/src/domain/aggregates/portfolio.js';
import type { Portfolio as PortfolioDTO, BacktestParameters } from '@backtest/shared';

function makeBasePortfolio(overrides: Partial<PortfolioDTO> = {}): PortfolioDTO {
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

describe('Portfolio.toEngineBody', () => {
  it.each<{
    name: string;
    overrides: Partial<PortfolioDTO>;
    match?: Record<string, unknown>;
    toEqual?: Record<string, unknown>;
    undefinedFields?: string[];
  }>([
    {
      name: '应正确映射基础字段（name/assets/rebalanceFrequency）',
      overrides: {},
      match: {
        name: 'Test Portfolio',
        assets: [
          { ticker: 'AAPL', weight: 60 },
          { ticker: 'BND', weight: 40 },
        ],
        rebalanceFrequency: 'monthly',
      },
    },
    {
      name: '应映射可选字段 rebalanceThreshold/rebalanceOffset/drag/totalReturn',
      overrides: { rebalanceThreshold: 5, rebalanceOffset: 1, drag: 0.5, totalReturn: true },
      match: { rebalanceThreshold: 5, rebalanceOffset: 1, drag: 0.5, totalReturn: true },
    },
    {
      name: '可选字段未设置时应为 undefined',
      overrides: {},
      undefinedFields: ['rebalanceThreshold', 'rebalanceOffset', 'drag', 'totalReturn'],
    },
    {
      name: 'rebalanceBands.enabled=false 时应返回 undefined',
      overrides: { rebalanceBands: { enabled: false, absoluteBand: 5, relativeBand: 20 } },
      undefinedFields: ['rebalanceBands'],
    },
    {
      name: 'rebalanceBands.enabled=true 时应映射 absolute/relative',
      overrides: { rebalanceBands: { enabled: true, absoluteBand: 5, relativeBand: 20 } },
      toEqual: { absolute: 5, relative: 20 },
    },
    {
      name: 'rebalanceBands 未设置时应为 undefined',
      overrides: {},
      undefinedFields: ['rebalanceBands'],
    },
    {
      name: 'isGlidepath=false 时 glidepath 字段应为 undefined',
      overrides: { isGlidepath: false, glidepathToWeights: [0.5, 0.5], glidepathYears: 10 },
      undefinedFields: ['glidepathToWeights', 'glidepathYears'],
    },
    {
      name: 'isGlidepath=true 时应映射 glidepathToWeights/glidepathYears',
      overrides: { isGlidepath: true, glidepathToWeights: [0.7, 0.3], glidepathYears: 15 },
      match: { glidepathToWeights: [0.7, 0.3], glidepathYears: 15 },
    },
    {
      name: 'isGlidepath=true 但 glidepath 字段未设置时应为 undefined',
      overrides: { isGlidepath: true },
      undefinedFields: ['glidepathToWeights', 'glidepathYears'],
    },
    {
      name: '单个 asset 应正确映射',
      overrides: { assets: [{ ticker: 'VTI', weight: 100 }] },
      match: { assets: [{ ticker: 'VTI', weight: 100 }] },
    },
  ])('$name', ({ overrides, match, toEqual, undefinedFields }) => {
    const body = Portfolio.fromDTO(makeBasePortfolio(overrides)).toEngineBody();
    if (match) expect(body).toMatchObject(match);
    if (toEqual) expect(body.rebalanceBands).toEqual(toEqual);
    for (const f of undefinedFields ?? []) {
      expect((body as Record<string, unknown>)[f]).toBeUndefined();
    }
  });
});

describe('buildEngineParams', () => {
  it.each<{
    name: string;
    params: BacktestParameters;
    match: Record<string, unknown>;
    checks?: (body: Record<string, unknown>) => void;
  }>([
    {
      name: '应正确映射所有必填字段',
      params: makeBaseParams(),
      match: {
        startDate: '2020-01-01',
        endDate: '2024-12-31',
        startingValue: 10000,
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: 'SPY',
      },
    },
    {
      name: '引擎必填字段缺省时应使用契约默认值',
      params: { startDate: '2020-01-01', endDate: '2021-01-01' } as BacktestParameters,
      match: {
        startingValue: 10000,
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
      },
    },
    {
      name: 'extendedWithdrawalStats 缺省时应默认为 false',
      params: makeBaseParams(),
      match: { extendedWithdrawalStats: false },
    },
    {
      name: 'cashflowLegs 缺省时应默认为空数组',
      params: makeBaseParams(),
      match: { cashflowLegs: [] },
    },
    {
      name: 'oneTimeCashflows 缺省时应默认为空数组',
      params: makeBaseParams(),
      match: { oneTimeCashflows: [] },
    },
    {
      name: 'extendedWithdrawalStats=true 时应原样映射',
      params: makeBaseParams({ extendedWithdrawalStats: true }),
      match: { extendedWithdrawalStats: true },
    },
    {
      name: 'cashflowLegs 设置时应原样映射',
      params: makeBaseParams({
        cashflowLegs: [
          { id: 'leg-1', amount: 1000, type: 'contribution', frequency: 'monthly', offset: 0 },
        ],
      }),
      match: {
        cashflowLegs: [
          { id: 'leg-1', amount: 1000, type: 'contribution', frequency: 'monthly', offset: 0 },
        ],
      },
    },
    {
      name: 'oneTimeCashflows 设置时应原样映射',
      params: makeBaseParams({
        oneTimeCashflows: [{ id: 'cf-1', amount: 5000, type: 'withdrawal', date: '2024-06-15' }],
      }),
      match: {
        oneTimeCashflows: [{ id: 'cf-1', amount: 5000, type: 'withdrawal', date: '2024-06-15' }],
      },
    },
    {
      name: '所有可选字段同时设置时应全部正确映射',
      params: makeBaseParams({
        extendedWithdrawalStats: true,
        cashflowLegs: [
          { id: 'l1', amount: 100, type: 'contribution', frequency: 'yearly', offset: 0 },
        ],
        oneTimeCashflows: [{ id: 'o1', amount: 200, type: 'withdrawal', date: '2024-01-01' }],
      }),
      match: { extendedWithdrawalStats: true },
      checks: (body) => {
        expect(body.cashflowLegs).toHaveLength(1);
        expect(body.oneTimeCashflows).toHaveLength(1);
      },
    },
  ])('$name', ({ params, match, checks }) => {
    const body = buildEngineParams(params) as unknown as Record<string, unknown>;
    expect(body).toMatchObject(match);
    checks?.(body);
  });
});
