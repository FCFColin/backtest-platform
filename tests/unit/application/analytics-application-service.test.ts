/**
 * analysis-service 单元测试
 *
 * 合并后覆盖：单资产分析、PCA、LETF、目标优化。
 * 所有计算逻辑已迁移到 Go 引擎，测试通过 mock callEngineStrict 验证编排逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PCARequest, GoalOptimizerRequest } from '@backtest/shared';
import type { LETFRequest } from '@backtest/shared/types/letf.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const engineMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
}));

const dataMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
}));

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataMocks.fetchHistoryData,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import {
  executePcaAnalyze,
  validatePcaRequest,
  executeLetfAnalyze,
  validateGoalOptimizerAssets,
  executeGoalOptimize,
  executePcaAnalyzeWithFetch,
} from '../../../packages/backend/src/application/analysis-orchestrator.js';
import { normalizeTickers } from '../../../packages/backend/src/application/backtest/priceDataUtils.js';

const mockPriceData: Record<string, Record<string, number>> = {
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

describe('analysis-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executePcaAnalyze', () => {
    it('应使用正确参数调用引擎并返回结果', async () => {
      engineMocks.callEngineStrict.mockResolvedValue(mockPcaResult);
      const result = await executePcaAnalyze(['AAPL', 'SPY'], mockPriceData, 2);
      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/pca', {
        tickers: ['AAPL', 'SPY'],
        priceData: mockPriceData,
        numComponents: 2,
      });
      expect(result).toBe(mockPcaResult);
    });

    it('数据缺失时应抛出错误', () => {
      expect(() => executePcaAnalyze(['AAPL', 'MISSING'], mockPriceData)).toThrow(
        '以下资产未找到价格数据: MISSING',
      );
    });
  });

  describe('normalizeTickers', () => {
    it('应去重、去除空格并转为大写', () => {
      expect(normalizeTickers([' aapl ', 'AAPL', '  spy  ', ''])).toEqual(['AAPL', 'SPY']);
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
        'Missing or invalid field: tickers',
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

    it('应使用正确参数调用引擎并返回结果', async () => {
      const mockLetfResult = { annualDecay: 0.05, effectiveLeverage: [2.8] };
      engineMocks.callEngineStrict.mockResolvedValue(mockLetfResult);

      const result = await executeLetfAnalyze(letfReq, letfPriceData);

      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/letf-analyze', {
        letfTicker: 'SSO',
        benchmarkTicker: 'SPY',
        leverage: 2,
        priceData: letfPriceData,
      });
      expect(result).toBe(mockLetfResult);
    });

    it('缺失 LETF 数据时应抛出错误', () => {
      expect(() =>
        executeLetfAnalyze(letfReq, { SPY: {} } as unknown as Record<
          string,
          Record<string, number>
        >),
      ).toThrow('杠杆 ETF SSO');
    });

    it('缺失基准数据时应抛出错误', () => {
      expect(() =>
        executeLetfAnalyze(letfReq, { SSO: { '2020-01-02': 50 } } as unknown as Record<
          string,
          Record<string, number>
        >),
      ).toThrow('基准指数 SPY');
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

    it('应使用正确参数调用引擎并返回结果', async () => {
      const mockGoalResult = { successProbability: 0.75 };
      engineMocks.callEngineStrict.mockResolvedValue(mockGoalResult);

      const result = await executeGoalOptimize(goalReq, mockPriceData, '2020-01-01', '2020-12-31');

      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/goal-optimize', {
        ...goalReq,
        priceData: mockPriceData,
        startDate: '2020-01-01',
        endDate: '2020-12-31',
      });
      expect(result).toBe(mockGoalResult);
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
  });

  describe('executePcaAnalyzeWithFetch', () => {
    it('应先获取数据再调用引擎', async () => {
      dataMocks.fetchHistoryData.mockResolvedValue({
        data: mockPriceData,
        degraded: false,
      });
      engineMocks.callEngineStrict.mockResolvedValue(mockPcaResult);

      const result = await executePcaAnalyzeWithFetch({
        tickers: ['AAPL', 'SPY'],
        startDate: '2020-01-01',
        endDate: '2020-12-31',
      });

      expect(dataMocks.fetchHistoryData).toHaveBeenCalled();
      expect(engineMocks.callEngineStrict).toHaveBeenCalled();
      expect(result).toBe(mockPcaResult);
    });
  });
});
