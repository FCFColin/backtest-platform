import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PCARequest, GoalOptimizerRequest } from '@backtest/shared';
import type { LETFRequest } from '@backtest/shared/types/letf.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const engineMocks = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));
const dataMocks = vi.hoisted(() => ({ fetchHistoryData: vi.fn() }));
const helpersMocks = vi.hoisted(() => ({
  fetchPriceDataWithRange: vi.fn(),
  calculateDateRange: vi.fn(),
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
}));
vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataMocks.fetchHistoryData,
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));
vi.mock('../../../packages/backend/src/application/backtest-helpers.js', () => ({
  fetchPriceDataWithRange: helpersMocks.fetchPriceDataWithRange,
  calculateDateRange: helpersMocks.calculateDateRange,
  pushDegradedWarning: (warnings: unknown[], degraded: boolean, degradedWarning?: string) => {
    if (degraded)
      warnings.push({
        code: 'DATA_DEGRADED',
        message: degradedWarning || '数据服务降级，部分数据可能缺失',
      });
  },
}));
vi.mock('../../../packages/backend/src/application/backtest/engineBodyBuilder.js', () => ({
  buildEngineParams: vi.fn(() => ({})),
}));

import {
  executePcaAnalyze,
  validatePcaRequest,
  executeLetfAnalyze,
  validateGoalOptimizerAssets,
  executeGoalOptimize,
  executePcaAnalyzeWithFetch,
  runAnalysis,
  executeLetfAnalyzeWithFetch,
  executeGoalOptimizeWithFetch,
} from '../../../packages/backend/src/application/analysis-orchestrator.js';
import { normalizeTickers } from '../../../packages/backend/src/application/backtest/priceDataUtils.js';

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
const LETF_REQ: LETFRequest = {
  letfTicker: 'SSO',
  benchmarkTicker: 'SPY',
  leverage: 2,
  startDate: '2020-01-01',
  endDate: '2020-12-31',
};
const LETF_PRICE = {
  SSO: { '2020-01-02': 50, '2020-01-03': 51 },
  SPY: { '2020-01-02': 300, '2020-01-03': 302 },
};
const GOAL_REQ: GoalOptimizerRequest = {
  targetAmount: 1000000,
  initialAmount: 100000,
  years: 10,
  assets: [
    { ticker: 'AAPL', weight: 60 },
    { ticker: 'SPY', weight: 40 },
  ],
};
const mockEngine = (r: unknown) => engineMocks.callEngineStrict.mockResolvedValue(r);
const mockFetchData = (d: unknown, dg = false) =>
  dataMocks.fetchHistoryData.mockResolvedValue({ data: d, degraded: dg });

describe('analysis-service', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      'executePcaAnalyze',
      () => executePcaAnalyze(['AAPL', 'SPY'], mockPriceData, 2),
      mockPcaResult,
      '/api/engine/pca',
      { tickers: ['AAPL', 'SPY'], priceData: mockPriceData, numComponents: 2 },
    ],
    [
      'executeLetfAnalyze',
      () => executeLetfAnalyze(LETF_REQ, LETF_PRICE),
      { annualDecay: 0.05, effectiveLeverage: [2.8] },
      '/api/engine/letf-analyze',
      { letfTicker: 'SSO', benchmarkTicker: 'SPY', leverage: 2, priceData: LETF_PRICE },
    ],
    [
      'executeGoalOptimize',
      () => executeGoalOptimize(GOAL_REQ, mockPriceData, '2020-01-01', '2020-12-31'),
      { successProbability: 0.75 },
      '/api/engine/goal-optimize',
      { ...GOAL_REQ, priceData: mockPriceData, startDate: '2020-01-01', endDate: '2020-12-31' },
    ],
  ])('%s 应使用正确参数调用引擎并返回结果', async (_n, fn, result, endpoint, expected) => {
    mockEngine(result);
    expect(await fn()).toBe(result);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(endpoint, expected);
  });

  it.each([
    [
      'PCA 数据缺失',
      () => executePcaAnalyze(['AAPL', 'MISSING'], mockPriceData),
      'Price data not found for: MISSING',
    ],
    [
      'Goal 数据缺失',
      () =>
        executeGoalOptimize(
          GOAL_REQ,
          { SPY: { '2020-01-02': 300 } } as never,
          '2020-01-01',
          '2020-12-31',
        ),
      'Price data not found for: AAPL',
    ],
  ])('%s 应抛出错误', (_n, fn, expected) => {
    expect(fn).toThrow(expected);
  });

  it('normalizeTickers 应去重、去除空格并转为大写', () => {
    expect(normalizeTickers([' aapl ', 'AAPL', '  spy  ', ''])).toEqual(['AAPL', 'SPY']);
  });

  describe('validatePcaRequest', () => {
    const v: PCARequest = {
      tickers: ['AAPL', 'SPY'],
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    };
    it('有效请求应返回规范化 ticker 列表', () =>
      expect(validatePcaRequest(v)).toEqual(['AAPL', 'SPY']));
    it.each([
      ['空 tickers', { ...v, tickers: [] }, 'Missing or invalid field: tickers'],
      [
        '缺失日期',
        { tickers: ['AAPL', 'SPY'], startDate: '', endDate: '' },
        'Missing required fields: startDate, endDate',
      ],
      ['少于 2 个资产', { ...v, tickers: ['AAPL'] }, 'PCA analysis requires at least 2 assets'],
    ])('%s 应抛出错误', (_n, req, expected) => {
      expect(() => validatePcaRequest(req as PCARequest)).toThrow(expected);
    });
  });

  it.each([
    ['缺失 LETF 数据', { SPY: {} }, '杠杆 ETF SSO'],
    ['缺失基准数据', { SSO: { '2020-01-02': 50 } }, '基准指数 SPY'],
  ])('executeLetfAnalyze %s 应抛出错误', (_n, data, expected) => {
    expect(() => executeLetfAnalyze(LETF_REQ, data as never)).toThrow(expected);
  });

  it.each([
    [
      '应返回去重后的大写 ticker 列表',
      [
        { ticker: '  aapl  ', weight: 60 },
        { ticker: 'AAPL', weight: 0 },
        { ticker: 'SPY', weight: 40 },
      ],
      ['AAPL', 'SPY'],
      null,
    ],
    [
      '无有效资产应抛出错误',
      [{ ticker: '', weight: 100 }],
      null,
      'Please add at least one valid ticker',
    ],
  ])('validateGoalOptimizerAssets %s', (_n, assets, expected, error) => {
    const req = { targetAmount: 1000000, initialAmount: 100000, years: 10, assets } as never;
    if (error) expect(() => validateGoalOptimizerAssets(req)).toThrow(error);
    else expect(validateGoalOptimizerAssets(req)).toEqual(expected);
  });

  it.each([
    [
      'executePcaAnalyzeWithFetch',
      () =>
        executePcaAnalyzeWithFetch({
          tickers: ['AAPL', 'SPY'],
          startDate: '2020-01-01',
          endDate: '2020-12-31',
        }),
      mockPcaResult,
      mockPriceData,
    ],
    [
      'executeLetfAnalyzeWithFetch',
      () => executeLetfAnalyzeWithFetch(LETF_REQ),
      { annualDecay: 0.05, effectiveLeverage: [2.8] },
      LETF_PRICE,
    ],
    [
      'executeGoalOptimizeWithFetch',
      () => executeGoalOptimizeWithFetch(GOAL_REQ),
      { successProbability: 0.75 },
      mockPriceData,
    ],
  ])('%s 应先获取数据再调用引擎', async (_n, fn, result, data) => {
    mockFetchData(data);
    mockEngine(result);
    expect(await fn()).toBe(result);
    expect(dataMocks.fetchHistoryData).toHaveBeenCalled();
    expect(engineMocks.callEngineStrict).toHaveBeenCalled();
  });

  it('executeGoalOptimizeWithFetch 无有效资产时应抛出错误且不获取数据', async () => {
    await expect(
      executeGoalOptimizeWithFetch({ ...GOAL_REQ, assets: [{ ticker: '', weight: 100 }] }),
    ).rejects.toThrow('Please add at least one valid ticker');
    expect(dataMocks.fetchHistoryData).not.toHaveBeenCalled();
  });

  describe('runAnalysis', () => {
    const params = { startDate: '2020-01-01', endDate: '2020-12-31' };
    beforeEach(() =>
      helpersMocks.calculateDateRange.mockReturnValue({
        requested: { start: '2020-01-01', end: '2020-12-31' },
        actual: { start: '2020-01-02', end: '2020-12-30' },
        clamped: false,
      }),
    );
    it('正常路径：获取数据、调用引擎、返回组装结果', async () => {
      helpersMocks.fetchPriceDataWithRange.mockResolvedValue({
        priceData: mockPriceData,
        degraded: false,
      });
      mockEngine({
        data: {
          assets: ['AAPL', 'SPY'],
          correlations: [
            [1, 0.5],
            [0.5, 1],
          ],
        },
      });
      const result = await runAnalysis(['AAPL', 'SPY'], params);
      expect(helpersMocks.fetchPriceDataWithRange).toHaveBeenCalledWith(
        ['AAPL', 'SPY'],
        '2020-01-01',
        '2020-12-31',
      );
      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(
        '/api/engine/analysis',
        expect.objectContaining({ tickers: ['AAPL', 'SPY'], priceData: mockPriceData }),
      );
      expect(result).toMatchObject({
        tickers: ['AAPL', 'SPY'],
        correlations: [
          [1, 0.5],
          [0.5, 1],
        ],
      });
      expect(result.dateRange).toBeDefined();
      expect(result.warnings).toBeUndefined();
    });
    it('数据降级时应添加 DATA_DEGRADED 警告', async () => {
      helpersMocks.fetchPriceDataWithRange.mockResolvedValue({
        priceData: { AAPL: mockPriceData.AAPL },
        degraded: true,
        degradedWarning: '数据服务降级',
      });
      mockEngine({});
      expect((await runAnalysis(['AAPL'], params)).warnings).toContainEqual({
        code: 'DATA_DEGRADED',
        message: '数据服务降级',
      });
    });
    it('部分 ticker 缺失时应添加 TICKER_NOT_FOUND 警告并仅传有效 ticker', async () => {
      helpersMocks.fetchPriceDataWithRange.mockResolvedValue({
        priceData: { AAPL: mockPriceData.AAPL },
        degraded: false,
      });
      mockEngine({});
      const result = await runAnalysis(['AAPL', 'MISSING'], params);
      expect(result.warnings).toContainEqual({ code: 'TICKER_NOT_FOUND', tickers: ['MISSING'] });
      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(
        '/api/engine/analysis',
        expect.objectContaining({ tickers: ['AAPL'] }),
      );
    });
    it('所有 ticker 数据缺失时应抛出 ValidationError 且不调用引擎', async () => {
      helpersMocks.fetchPriceDataWithRange.mockResolvedValue({ priceData: {}, degraded: false });
      await expect(runAnalysis(['AAPL', 'SPY'], params)).rejects.toThrow(
        'Price data unavailable for all tickers: AAPL, SPY',
      );
      expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
    });
    it('引擎返回无 data.assets 时应展开原始结果', async () => {
      helpersMocks.fetchPriceDataWithRange.mockResolvedValue({
        priceData: mockPriceData,
        degraded: false,
      });
      mockEngine({ foo: 'bar', baz: 123 });
      const result = await runAnalysis(['AAPL', 'SPY'], params);
      expect(result).toMatchObject({ foo: 'bar', baz: 123 });
      expect(result.dateRange).toBeDefined();
    });
  });
});
