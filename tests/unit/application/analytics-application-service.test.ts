import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PCARequest } from '@backtest/shared';
import * as fixture from '../../helpers/appServiceFixture.js';
import { mockBacktestParams } from '../../helpers/storeFixtures.js';

const helpersMocks = vi.hoisted(() => ({
  preparePriceDataAndWarnings: vi.fn(),
  calculateDateRange: vi.fn(),
}));

vi.mock('../../../packages/backend/src/application/backtest-helpers.js', () => ({
  preparePriceDataAndWarnings: helpersMocks.preparePriceDataAndWarnings,
  calculateDateRange: helpersMocks.calculateDateRange,
}));
vi.mock('../../../packages/backend/src/application/backtest/backtestEngineUtils.js', async (o) => ({
  ...(await o<Record<string, unknown>>()),
  buildEngineParams: vi.fn(() => ({})),
}));

import * as orch from '../../../packages/backend/src/application/analysis-orchestrator.js';
import * as utils from '../../../packages/backend/src/application/backtest/backtestEngineUtils.js';
import * as es from '../../../packages/backend/src/schemas/engineSchemas.js';
import { engineMocks } from '../../helpers/engineFixture.js';

describe('analysis-service', () => {
  const SD = '2020-01-01';
  const ED = '2020-12-31';
  const ppm = helpersMocks.preparePriceDataAndWarnings;
  const base = () => ({ warnings: [], invalidTickers: [] });

  const mockPriceData = {
    AAPL: { '2020-01-02': 100, '2020-01-03': 101, '2020-01-06': 102 },
    SPY: { '2020-01-02': 300, '2020-01-03': 302, '2020-01-06': 305 },
    TLT: { '2020-01-02': 150, '2020-01-03': 149, '2020-01-06': 151 },
    SSO: { '2020-01-02': 50, '2020-01-03': 51 },
  };
  const mockPcaResult = {
    eigenvalues: [1.5, 0.5],
    cumulativeVariance: [0.75, 1.0],
    loadings: [
      [0.7, 0.3],
      [0.3, 0.7],
    ],
    scores: [[0.5, -0.2]],
    tickers: ['AAPL', 'SPY'],
  };
  const LR = { letfTicker: 'SSO', benchmarkTicker: 'SPY', leverage: 2, startDate: SD, endDate: ED };
  const LP = { SSO: mockPriceData.SSO, SPY: mockPriceData.SPY };
  const GA = [
    { ticker: 'AAPL', weight: 60 },
    { ticker: 'SPY', weight: 40 },
  ];
  const GR = { targetAmount: 1000000, initialAmount: 100000, years: 10, assets: GA };
  const AAPL_ONLY = { AAPL: mockPriceData.AAPL };
  const PCA_REQ: PCARequest = { tickers: ['AAPL', 'SPY'], startDate: SD, endDate: ED };

  const mockFetchData = (d: unknown, dg = false) => {
    fixture.mockFetchHistoryData(d, dg);
    ppm.mockResolvedValue({ priceData: d, ...base(), degraded: dg, degradedWarning: undefined });
  };

  beforeEach(() => {
    fixture.resetAppServiceMocks();
    ppm.mockReset();
    helpersMocks.calculateDateRange.mockReset();
  });

  const pcaCall = () => orch.executePcaAnalyze(['AAPL', 'SPY'], mockPriceData, 2);
  const letfCall = () => orch.executeLetfAnalyze(LR, LP);
  const goalCall = () => orch.executeGoalOptimize(GR, mockPriceData, SD, ED);
  const DECAY = { annualDecay: 0.05, effectiveLeverage: [2.8] };
  const PROB = { successProbability: 0.75 };
  const PCA_CALL = { tickers: ['AAPL', 'SPY'], priceData: mockPriceData, numComponents: 2 };
  const LETF_CALL = { letfTicker: 'SSO', benchmarkTicker: 'SPY', leverage: 2, priceData: LP };
  const GOAL_CALL = { ...GR, priceData: mockPriceData, startDate: SD, endDate: ED };

  it.each([
    ['PCA', pcaCall, mockPcaResult, '/api/engine/pca', PCA_CALL, es.pcaResultSchema],
    ['LETF', letfCall, DECAY, '/api/engine/letf-analyze', LETF_CALL, es.letfResultSchema],
    ['GOAL', goalCall, PROB, '/api/engine/goal-optimize', GOAL_CALL, es.goalOptimizeResultSchema],
  ])('%s 应使用正确参数调用引擎并返回结果', async (_n, fn, result, endpoint, expected, schema) => {
    fixture.mockEngine(result);
    expect(await fn()).toBe(result);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(endpoint, expected, schema);
  });

  const pcaMissing = () => orch.executePcaAnalyze(['AAPL', 'MISSING'], mockPriceData);
  const goalMissing = () =>
    orch.executeGoalOptimize(GR, { SPY: { '2020-01-02': 300 } } as never, SD, ED);

  it.each([
    ['PCA 数据缺失', pcaMissing, 'Price data not found for: MISSING'],
    ['Goal 数据缺失', goalMissing, 'Price data not found for: AAPL'],
  ])('%s 应抛出错误', (_n, fn, expected) => {
    expect(fn).toThrow(expected);
  });

  it('normalizeTickers 应去重、去除空格并转为大写', () => {
    expect(utils.normalizeTickers([' aapl ', 'AAPL', '  spy  ', ''])).toEqual(['AAPL', 'SPY']);
  });

  describe('validatePcaRequest', () => {
    it('有效请求应返回规范化 ticker 列表', () =>
      expect(orch.validatePcaRequest(PCA_REQ)).toEqual(['AAPL', 'SPY']));
    it.each([
      ['空 tickers', { ...PCA_REQ, tickers: [] }, 'Missing or invalid field: tickers'],
      [
        '缺失日期',
        { ...PCA_REQ, startDate: '', endDate: '' },
        'Missing required fields: startDate, endDate',
      ],
      [
        '少于 2 个资产',
        { ...PCA_REQ, tickers: ['AAPL'] },
        'PCA analysis requires at least 2 assets',
      ],
    ])('%s 应抛出错误', (_n, req, expected) => {
      expect(() => orch.validatePcaRequest(req as PCARequest)).toThrow(expected);
    });
  });

  it.each([
    ['缺失 LETF 数据', { SPY: {} }, 'Price data not found for: SSO'],
    ['缺失基准数据', { SSO: { '2020-01-02': 50 } }, 'Price data not found for: SPY'],
  ])('executeLetfAnalyze %s 应抛出错误', (_n, data, expected) => {
    expect(() => orch.executeLetfAnalyze(LR, data as never)).toThrow(expected);
  });

  const dupA = [
    { ticker: '  aapl  ', weight: 60 },
    { ticker: 'AAPL', weight: 0 },
    { ticker: 'SPY', weight: 40 },
  ];
  const goalReq = (assets: unknown) => ({ ...GR, assets }) as never;

  it.each([
    ['去重大写', dupA, ['AAPL', 'SPY'], null],
    ['无有效资产', [{ ticker: '', weight: 100 }], null, 'Please add at least one valid ticker'],
  ])('validateGoalOptimizerAssets %s', (_n, assets, expected, error) => {
    const req = goalReq(assets);
    if (error) expect(() => orch.validateGoalOptimizerAssets(req)).toThrow(error);
    else expect(orch.validateGoalOptimizerAssets(req)).toEqual(expected);
  });

  const pcaFetch = () => orch.executePcaAnalyzeWithFetch(PCA_REQ);
  const letfFetch = () => orch.executeLetfAnalyzeWithFetch(LR);
  const goalFetch = () => orch.executeGoalOptimizeWithFetch(GR);

  it.each([
    ['executePcaAnalyzeWithFetch', pcaFetch, mockPcaResult, mockPriceData],
    ['executeLetfAnalyzeWithFetch', letfFetch, DECAY, LP],
    ['executeGoalOptimizeWithFetch', goalFetch, PROB, mockPriceData],
  ])('%s 应先获取数据再调用引擎', async (_n, fn, result, data) => {
    mockFetchData(data);
    fixture.mockEngine(result);
    expect((await fn()).data).toBe(result);
    expect(ppm).toHaveBeenCalled();
    expect(engineMocks.callEngineStrict).toHaveBeenCalled();
  });

  it('executeGoalOptimizeWithFetch 无有效资产时应抛出错误且不获取数据', async () => {
    await expect(
      orch.executeGoalOptimizeWithFetch({ ...GR, assets: [{ ticker: '', weight: 100 }] }),
    ).rejects.toThrow('Please add at least one valid ticker');
    expect(ppm).not.toHaveBeenCalled();
  });

  describe('runAnalysis', () => {
    const params = mockBacktestParams({ startDate: SD, endDate: ED });
    const DATE_RANGE = {
      requested: { start: SD, end: ED },
      actual: { start: '2020-01-02', end: '2020-12-30' },
      clamped: false,
    };
    const prep = (over: Record<string, unknown> = {}) =>
      ppm.mockResolvedValue({
        priceData: {},
        allTickers: new Set<string>(),
        dateRange: DATE_RANGE,
        ...base(),
        ...over,
      });
    beforeEach(() => prep({}));

    it('正常路径：获取数据、调用引擎、返回组装结果', async () => {
      prep({ priceData: mockPriceData });
      const CORR = [
        [1, 0.5],
        [0.5, 1],
      ];
      fixture.mockEngine({ assets: ['AAPL', 'SPY'], correlations: CORR });
      const result = await orch.runAnalysis(['AAPL', 'SPY'], params);
      expect(ppm).toHaveBeenCalledWith(['AAPL', 'SPY'], SD, ED);
      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(
        '/api/engine/analysis',
        expect.objectContaining({ tickers: ['AAPL', 'SPY'], priceData: mockPriceData }),
        es.analysisResultSchema,
      );
      expect(result.data).toMatchObject({ tickers: ['AAPL', 'SPY'], correlations: CORR });
      expect(result.dateRange).toBeDefined();
      expect(result.warnings).toEqual([]);
    });

    it('数据降级时应透出 DATA_DEGRADED 警告', async () => {
      const DEGRADED = { code: 'DATA_DEGRADED', message: '数据服务降级' };
      prep({ priceData: AAPL_ONLY, warnings: [DEGRADED] });
      fixture.mockEngine({});
      expect((await orch.runAnalysis(['AAPL'], params)).warnings).toContainEqual(DEGRADED);
    });

    it('部分 ticker 缺失时应透出 TICKER_NOT_FOUND 警告并仅传有效 ticker', async () => {
      const TNF = { code: 'TICKER_NOT_FOUND', tickers: ['MISSING'] };
      prep({ priceData: AAPL_ONLY, invalidTickers: ['MISSING'], warnings: [TNF] });
      fixture.mockEngine({});
      const result = await orch.runAnalysis(['AAPL', 'MISSING'], params);
      expect(result.warnings).toContainEqual(TNF);
      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(
        '/api/engine/analysis',
        expect.objectContaining({ tickers: ['AAPL'] }),
        es.analysisResultSchema,
      );
    });

    it('所有 ticker 数据缺失时应抛出 ValidationError 且不调用引擎', async () => {
      prep({ invalidTickers: ['AAPL', 'SPY'] });
      await expect(orch.runAnalysis(['AAPL', 'SPY'], params)).rejects.toThrow(
        'Price data unavailable for all tickers: AAPL, SPY',
      );
      expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
    });

    it('引擎返回无 data.assets 时应展开原始结果', async () => {
      prep({ priceData: mockPriceData });
      fixture.mockEngine({ foo: 'bar', baz: 123 });
      const result = await orch.runAnalysis(['AAPL', 'SPY'], params);
      expect(result.data).toMatchObject({ foo: 'bar', baz: 123 });
      expect(result.dateRange).toBeDefined();
    });
  });
});
