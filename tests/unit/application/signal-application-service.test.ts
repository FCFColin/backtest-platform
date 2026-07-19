/**
 * signal-application-service 单元测试
 *
 * 计算逻辑已迁移到 Go 引擎（ADR-031），测试通过 mock callEngineStrict + fetchHistoryData 验证编排逻辑。
 * 合并后的服务函数内部完成数据获取，不再由调用方传入 priceData。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '@backtest/shared/types/signal.js';

const engineMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
}));

const dataMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
}));

vi.mock('../../../packages/backend/src/services/dataService.js', () => ({
  fetchHistoryData: dataMocks.fetchHistoryData,
}));

import {
  executeSignalAnalyze,
  executeDualSignalAnalyze,
  executeMultiSignalAnalyze,
} from '../../../packages/backend/src/services/signal-orchestrator.js';

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

    it('应使用正确参数调用引擎并返回结果', async () => {
      const priceData = { AAPL: { '2020-01-02': 100 } };
      dataMocks.fetchHistoryData.mockResolvedValue({ data: priceData, degraded: false });
      engineMocks.callEngineStrict.mockResolvedValue(mockSignalResult);

      const result = await executeSignalAnalyze(signalReq);

      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/signal-analyze', {
        mode: 'single',
        single: signalReq,
        priceData,
      });
      expect(result).toBe(mockSignalResult);
    });

    it('无价格数据时应抛出错误', async () => {
      dataMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });

      await expect(executeSignalAnalyze(signalReq)).rejects.toThrow('未找到 AAPL 的价格数据');
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

    it('应使用正确参数调用引擎并返回结果', async () => {
      const history = {
        AAPL: { '2020-01-02': 100 },
        SPY: { '2020-01-02': 300 },
      };
      dataMocks.fetchHistoryData.mockResolvedValue({ data: history, degraded: false });
      engineMocks.callEngineStrict.mockResolvedValue(mockSignalResult);

      const result = await executeDualSignalAnalyze(dualReq);

      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/signal-analyze', {
        mode: 'dual',
        dual: dualReq,
        priceData: history,
      });
      expect(result).toBe(mockSignalResult);
    });

    it('无价格数据时应抛出错误', async () => {
      dataMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });

      await expect(executeDualSignalAnalyze(dualReq)).rejects.toThrow('未找到价格数据');
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

    it('应使用正确参数调用引擎并返回结果', async () => {
      const history = { AAPL: { '2020-01-02': 100 } };
      dataMocks.fetchHistoryData.mockResolvedValue({ data: history, degraded: false });
      engineMocks.callEngineStrict.mockResolvedValue(mockSignalResult);

      const result = await executeMultiSignalAnalyze(multiReq);

      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith('/api/engine/signal-analyze', {
        mode: 'multi',
        multi: multiReq,
        priceData: history,
      });
      expect(result).toBe(mockSignalResult);
    });

    it('无价格数据时应抛出错误', async () => {
      dataMocks.fetchHistoryData.mockResolvedValue({ data: {}, degraded: false });

      await expect(executeMultiSignalAnalyze(multiReq)).rejects.toThrow('未找到');
    });
  });
});
