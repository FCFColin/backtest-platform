import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PCARequest, GoalOptimizerRequest } from '@backtest/shared';
import type { LETFRequest } from '@backtest/shared/types/letf.js';

const engineMocks = vi.hoisted(() => ({
  performPCA: vi.fn(),
  toSortedSeries: vi.fn(),
  analyzeLetfSlippage: vi.fn(),
  optimizeGoals: vi.fn(),
}));

vi.mock('../../../packages/backend/src/engine/pca.js', () => ({
  performPCA: engineMocks.performPCA,
}));

vi.mock('../../../packages/backend/src/engine/seriesUtils.js', () => ({
  toSortedSeries: engineMocks.toSortedSeries,
}));

vi.mock('../../../packages/backend/src/engine/letf.js', () => ({
  analyzeLetfSlippage: engineMocks.analyzeLetfSlippage,
}));

vi.mock('../../../packages/backend/src/engine/goalOptimizer.js', () => ({
  optimizeGoals: engineMocks.optimizeGoals,
}));

import {
  executePcaAnalyze,
  normalizePcaTickers,
  validatePcaRequest,
  executeLetfAnalyze,
  validateGoalOptimizerAssets,
  executeGoalOptimize,
} from '../../../packages/backend/src/application/analytics-application-service.js';

const mockPriceData: Record<string, Record<string, number>> = {
  AAPL: { '2020-01-02': 100, '2020-01-03': 101, '2020-01-06': 102 },
  SPY: { '2020-01-02': 300, '2020-01-03': 302, '2020-01-06': 305 },
  TLT: { '2020-01-02': 150, '2020-01-03': 149, '2020-01-06': 151 },
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

const mockSortedSeries = [
  { date: '2020-01-02', value: 100 },
  { date: '2020-01-03', value: 101 },
];

const mockLetfResult = {
  slippageCurve: [{ date: '2020-01-02', slippage: 0.01 }],
  annualDecay: 0.05,
  effectiveLeverage: [2.8],
  stats: {
    benchmarkReturn: 0.1,
    letfReturn: 0.08,
    expectedReturn: 0.2,
    slippage: 0.12,
  },
};

const mockGoalOptimizerResult = {
  successProbability: 0.75,
  probabilityCurve: [{ amount: 100000, probability: 0.75 }],
  optimalPath: [{ year: 1, median: 105000, p10: 95000, p90: 115000 }],
  recommendation: {
    expectedReturn: 0.08,
    requiredContribution: 5000,
    successRate: 0.75,
  },
};

describe('analytics-application-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executePcaAnalyze', () => {
    it('应使用正确参数调用 performPCA 并返回结果', () => {
      engineMocks.performPCA.mockReturnValue(mockPcaResult);
      const result = executePcaAnalyze(['AAPL', 'SPY'], mockPriceData, 2);
      expect(engineMocks.performPCA).toHaveBeenCalledWith(['AAPL', 'SPY'], mockPriceData, 2);
      expect(result).toBe(mockPcaResult);
    });

    it('数据缺失时应抛出错误', () => {
      expect(() => executePcaAnalyze(['AAPL', 'MISSING'], mockPriceData)).toThrow(
        '以下资产未找到价格数据: MISSING',
      );
    });
  });

  describe('normalizePcaTickers', () => {
    it('应去重、去除空格并转为大写', () => {
      expect(normalizePcaTickers([' aapl ', 'AAPL', '  spy  ', ''])).toEqual(['AAPL', 'SPY']);
    });
  });

  describe('validatePcaRequest', () => {
    const validReq: PCARequest = {
      tickers: ['AAPL', 'SPY'],
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    };

    it('有效请求应返回规范化 ticker 列表', () => {
      expect(validatePcaRequest(validReq)).toEqual(['AAPL', 'SPY']);
    });

    it('空 tickers 应抛出错误', () => {
      expect(() => validatePcaRequest({ ...validReq, tickers: [] })).toThrow(
        'Missing or invalid field: tickers (must be a non-empty array)',
      );
    });

    it('缺失日期应抛出错误', () => {
      expect(() =>
        validatePcaRequest({ tickers: ['AAPL', 'SPY'], startDate: '', endDate: '' }),
      ).toThrow('Missing required fields: startDate, endDate');
    });

    it('少于 2 个资产应抛出错误', () => {
      expect(() => validatePcaRequest({ ...validReq, tickers: ['AAPL'] })).toThrow(
        'PCA 分析至少需要 2 个资产',
      );
    });
  });

  describe('executeLetfAnalyze', () => {
    const letfReq: LETFRequest = {
      letfTicker: 'SSO',
      benchmarkTicker: 'SPY',
      leverage: 2,
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    };

    const letfPriceData: Record<string, Record<string, number>> = {
      SSO: { '2020-01-02': 50, '2020-01-03': 51 },
      SPY: { '2020-01-02': 300, '2020-01-03': 302 },
    };

    it('应使用正确参数调用引擎并返回结果', () => {
      engineMocks.toSortedSeries
        .mockReturnValueOnce(mockSortedSeries)
        .mockReturnValueOnce(mockSortedSeries);
      engineMocks.analyzeLetfSlippage.mockReturnValue(mockLetfResult);

      const result = executeLetfAnalyze(letfReq, letfPriceData);

      expect(engineMocks.toSortedSeries).toHaveBeenCalledWith(letfPriceData.SSO);
      expect(engineMocks.toSortedSeries).toHaveBeenCalledWith(letfPriceData.SPY);
      expect(engineMocks.analyzeLetfSlippage).toHaveBeenCalledWith(
        mockSortedSeries,
        mockSortedSeries,
        2,
      );
      expect(result).toBe(mockLetfResult);
    });

    it('缺失 LETF 数据时应抛出错误', () => {
      expect(() =>
        executeLetfAnalyze(letfReq, { SPY: {} } as unknown as Record<
          string,
          Record<string, number>
        >),
      ).toThrow('未找到杠杆 ETF SSO 的价格数据');
    });

    it('缺失基准数据时应抛出错误', () => {
      expect(() =>
        executeLetfAnalyze(letfReq, { SSO: { '2020-01-02': 50 } } as unknown as Record<
          string,
          Record<string, number>
        >),
      ).toThrow('未找到基准指数 SPY 的价格数据');
    });
  });

  describe('validateGoalOptimizerAssets', () => {
    it('应返回去重后的大写 ticker 列表', () => {
      const req = {
        targetAmount: 1000000,
        initialAmount: 100000,
        years: 10,
        assets: [
          { ticker: '  aapl  ', weight: 60 },
          { ticker: 'AAPL', weight: 0 },
          { ticker: 'SPY', weight: 40 },
        ],
      };
      expect(validateGoalOptimizerAssets(req)).toEqual(['AAPL', 'SPY']);
    });

    it('无有效资产时应抛出错误', () => {
      const req = {
        targetAmount: 1000000,
        initialAmount: 100000,
        years: 10,
        assets: [{ ticker: '', weight: 100 }],
      };
      expect(() => validateGoalOptimizerAssets(req)).toThrow('请至少添加一个有效标的');
    });
  });

  describe('executeGoalOptimize', () => {
    const goalReq: GoalOptimizerRequest = {
      targetAmount: 1000000,
      initialAmount: 100000,
      years: 10,
      assets: [
        { ticker: 'AAPL', weight: 60 },
        { ticker: 'SPY', weight: 40 },
      ],
    };

    it('应使用正确参数调用 optimizeGoals 并返回结果', () => {
      engineMocks.optimizeGoals.mockReturnValue(mockGoalOptimizerResult);
      const result = executeGoalOptimize(goalReq, mockPriceData, '2020-01-01', '2020-12-31');
      expect(engineMocks.optimizeGoals).toHaveBeenCalledWith(
        goalReq,
        mockPriceData,
        '2020-01-01',
        '2020-12-31',
      );
      expect(result).toBe(mockGoalOptimizerResult);
    });

    it('缺失 ticker 数据时应抛出错误', () => {
      expect(() =>
        executeGoalOptimize(
          goalReq,
          { SPY: { '2020-01-02': 300 } } as unknown as Record<string, Record<string, number>>,
          '2020-01-01',
          '2020-12-31',
        ),
      ).toThrow('以下资产未找到价格数据: AAPL');
    });

    it('历史数据不足时应抛出错误', () => {
      const emptyResult = {
        ...mockGoalOptimizerResult,
        successProbability: 0,
        probabilityCurve: [],
      };
      engineMocks.optimizeGoals.mockReturnValue(emptyResult);
      expect(() => executeGoalOptimize(goalReq, mockPriceData, '2020-01-01', '2020-12-31')).toThrow(
        '历史价格数据不足，无法计算收益率统计',
      );
    });
  });
});
