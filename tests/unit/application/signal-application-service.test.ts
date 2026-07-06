import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '../../../shared/types/signal.js';

const engineMocks = vi.hoisted(() => ({
  toPriceSeries: vi.fn(),
  analyzeSignal: vi.fn(),
  analyzeDualSignal: vi.fn(),
  analyzeMultiSignal: vi.fn(),
}));

vi.mock('../../../packages/backend/src/engine/seriesUtils.js', () => ({
  toPriceSeries: engineMocks.toPriceSeries,
}));

vi.mock('../../../packages/backend/src/engine/signal.js', () => ({
  analyzeSignal: engineMocks.analyzeSignal,
  analyzeDualSignal: engineMocks.analyzeDualSignal,
  analyzeMultiSignal: engineMocks.analyzeMultiSignal,
}));

import {
  executeSignalAnalyze,
  executeDualSignalAnalyze,
  executeMultiSignalAnalyze,
} from '../../../packages/backend/src/application/signal-application-service.js';

const mockPriceSeries = [
  { date: '2020-01-02', value: 100 },
  { date: '2020-01-03', value: 101 },
  { date: '2020-01-06', value: 102 },
];

const mockSignalResult = {
  signals: [
    { date: '2020-01-03', type: 'buy' as const, price: 101 },
    { date: '2020-01-06', type: 'sell' as const, price: 102 },
  ],
  statistics: {
    totalSignals: 2,
    winRate: 0.5,
    avgReturn: 0.02,
    maxDrawdown: 0.05,
    sharpe: 1.2,
  },
  equityCurve: [
    { date: '2020-01-02', value: 100 },
    { date: '2020-01-06', value: 105 },
  ],
};

describe('signal-application-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeSignalAnalyze', () => {
    const signalReq: SignalAnalysisRequest = {
      ticker: 'AAPL',
      indicator: 'SMA',
      period: 20,
      threshold: 0.02,
      startDate: '2020-01-01',
      endDate: '2020-12-31',
      signalType: 'both',
    };

    it('应使用正确参数调用 analyzeSignal 并返回结果', () => {
      engineMocks.toPriceSeries.mockReturnValue(mockPriceSeries);
      engineMocks.analyzeSignal.mockReturnValue(mockSignalResult);

      const result = executeSignalAnalyze(signalReq, { AAPL: { '2020-01-02': 100 } });

      expect(engineMocks.toPriceSeries).toHaveBeenCalledWith({ '2020-01-02': 100 });
      expect(engineMocks.analyzeSignal).toHaveBeenCalledWith(signalReq, mockPriceSeries);
      expect(result).toBe(mockSignalResult);
    });

    it('无价格数据时应抛出错误', () => {
      engineMocks.toPriceSeries.mockReturnValue([]);
      expect(() => executeSignalAnalyze(signalReq, {})).toThrow('未找到 AAPL 的价格数据');
    });
  });

  describe('executeDualSignalAnalyze', () => {
    const dualReq: DualSignalConfig = {
      signal1: {
        ticker: 'AAPL',
        indicator: 'SMA',
        period: 20,
        threshold: 0.02,
        startDate: '2020-01-01',
        endDate: '2020-12-31',
        signalType: 'entry',
      },
      signal2: {
        ticker: 'SPY',
        indicator: 'RSI',
        period: 14,
        threshold: 30,
        startDate: '2020-01-01',
        endDate: '2020-12-31',
        signalType: 'entry',
      },
      combinationMethod: 'and',
    };

    it('应使用正确参数调用 analyzeDualSignal 并返回结果', () => {
      engineMocks.toPriceSeries
        .mockReturnValueOnce(mockPriceSeries)
        .mockReturnValueOnce(mockPriceSeries);
      engineMocks.analyzeDualSignal.mockReturnValue(mockSignalResult);

      const history = {
        AAPL: { '2020-01-02': 100 },
        SPY: { '2020-01-02': 300 },
      };
      const result = executeDualSignalAnalyze(dualReq, history);

      expect(engineMocks.toPriceSeries).toHaveBeenCalledWith(history.AAPL);
      expect(engineMocks.toPriceSeries).toHaveBeenCalledWith(history.SPY);
      expect(engineMocks.analyzeDualSignal).toHaveBeenCalledWith(
        dualReq.signal1,
        dualReq.signal2,
        mockPriceSeries,
        mockPriceSeries,
        'and',
      );
      expect(result).toBe(mockSignalResult);
    });

    it('无价格数据时应抛出错误', () => {
      engineMocks.toPriceSeries.mockReturnValue([]);
      expect(() => executeDualSignalAnalyze(dualReq, {})).toThrow('未找到价格数据');
    });
  });

  describe('executeMultiSignalAnalyze', () => {
    const multiReq: MultiSignalConfig = {
      signals: [
        {
          ticker: 'AAPL',
          indicator: 'SMA',
          period: 20,
          threshold: 0.02,
          startDate: '2020-01-01',
          endDate: '2020-12-31',
          signalType: 'both',
        },
        {
          ticker: 'AAPL',
          indicator: 'RSI',
          period: 14,
          threshold: 30,
          startDate: '2020-01-01',
          endDate: '2020-12-31',
          signalType: 'both',
        },
      ],
      aggregationMethod: 'voting',
    };

    it('应使用正确参数调用 analyzeMultiSignal 并返回结果', () => {
      engineMocks.toPriceSeries.mockReturnValue(mockPriceSeries);
      engineMocks.analyzeMultiSignal.mockReturnValue(mockSignalResult);

      const history = { AAPL: { '2020-01-02': 100 } };
      const result = executeMultiSignalAnalyze(multiReq, history);

      expect(engineMocks.toPriceSeries).toHaveBeenCalledWith(history.AAPL);
      expect(engineMocks.analyzeMultiSignal).toHaveBeenCalledWith(
        multiReq.signals,
        mockPriceSeries,
        'voting',
        undefined,
      );
      expect(result).toBe(mockSignalResult);
    });

    it('无价格数据时应抛出错误', () => {
      engineMocks.toPriceSeries.mockReturnValue([]);
      expect(() => executeMultiSignalAnalyze(multiReq, {})).toThrow('未找到价格数据');
    });
  });
});
