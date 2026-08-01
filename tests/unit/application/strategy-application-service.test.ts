/**
 * 策略类应用服务（signal / tactical / grid）单元测试
 *
 * 计算逻辑已迁移到 Go 引擎（ADR-031），测试通过 mock callEngineStrict + fetchHistoryData 验证编排逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/backtestRoutesFixtures.js';
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '@backtest/shared/types/signal.js';
import type { TacticalStrategy } from '@backtest/shared/types/tactical.js';

const engineMocks = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));

const dataMocks = vi.hoisted(() => ({ fetchHistoryData: vi.fn() }));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const sanitizeMocks = vi.hoisted(() => ({ sanitizeLog: vi.fn((v: string) => v) }));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
  sanitizeLog: sanitizeMocks.sanitizeLog,
}));

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
}));

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataMocks.fetchHistoryData,
}));

import {
  executeSignalAnalyze,
  executeDualSignalAnalyze,
  executeMultiSignalAnalyze,
} from '../../../packages/backend/src/application/signal-orchestrator.js';
import {
  executeTacticalBacktest,
  executeTacticalWhatIf,
  collectTickers,
} from '../../../packages/backend/src/application/tactical-application-service.js';
import {
  executeGridSearch,
  MAX_GRID_COMBINATIONS,
} from '../../../packages/backend/src/application/grid-application-service.js';

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

describe('strategy-application-services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signal-application-service', () => {
    const signalReq: SignalAnalysisRequest = {
      ticker: 'AAPL',
      indicator: 'SMA',
      period: 20,
      threshold: 0.02,
      startDate: '2020-01-01',
      endDate: '2020-12-31',
      signalType: 'both',
    };

    describe('executeSignalAnalyze', () => {
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

        await expect(executeDualSignalAnalyze(dualReq)).rejects.toThrow('Price data not found for');
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

  describe('tactical-application-service', () => {
    const strategy: TacticalStrategy = {
      id: 's1',
      name: 'test',
      aggregationMethod: 'weighted_average',
      signals: [
        {
          id: 'sig1',
          name: 'sig',
          conditions: [{ indicator: 'sma', period: 20, operator: 'gt', threshold: 0 }],
          targetWeights: [{ ticker: 'SPY', weight: 100 }],
        },
      ],
    };

    function mockPriceData(data: Record<string, Record<string, number>>) {
      dataMocks.fetchHistoryData.mockResolvedValue({ data, degraded: false });
    }

    it('collectTickers 从策略中提取去重 ticker', () => {
      const tickers = collectTickers(strategy);
      expect(tickers).toEqual(['SPY']);
    });

    it('executeTacticalBacktest 在有效数据下返回结果', async () => {
      mockPriceData({ SPY: { '2020-01-01': 100, '2020-01-02': 101 } });
      engineMocks.callEngineStrict
        .mockResolvedValueOnce({
          portfolio: {
            name: 'tactical',
            growthCurve: [],
            drawdownCurve: [],
            rollingReturns: [],
            annualReturns: [],
            monthlyReturns: [],
            statistics: {},
          },
          signalHistory: [],
        })
        .mockResolvedValueOnce({
          portfolios: [
            {
              name: 'bench',
              growthCurve: [],
              drawdownCurve: [],
              rollingReturns: [],
              annualReturns: [],
              monthlyReturns: [],
              statistics: {},
            },
          ],
        });

      const result = await executeTacticalBacktest({
        strategy,
        startDate: '2020-01-01',
        endDate: '2020-01-02',
        startingValue: 10000,
        rebalanceFrequency: 'monthly',
      });
      expect(result.portfolio).toBeDefined();
      expect(result.benchmark).toBeDefined();
    });

    it('无效标的应抛出错误', async () => {
      mockPriceData({});
      await expect(
        executeTacticalBacktest({
          strategy,
          startDate: '2020-01-01',
          endDate: '2020-01-02',
          startingValue: 10000,
          rebalanceFrequency: 'monthly',
        }),
      ).rejects.toThrow('Price data not found for');
    });

    it('executeTacticalWhatIf 应返回最近信号权重', async () => {
      mockPriceData({ SPY: { '2020-01-01': 100, '2020-01-02': 101 } });
      engineMocks.callEngineStrict.mockResolvedValueOnce({
        signalHistory: [
          {
            date: '2020-01-02',
            activeSignals: ['sig1'],
            weights: [{ ticker: 'SPY', weight: 100 }],
          },
        ],
      });

      const result = await executeTacticalWhatIf(['SPY'], strategy);
      expect(result).toHaveLength(1);
      expect(result[0].ticker).toBe('SPY');
      expect(result[0].weight).toBe(100);
    });

    it('benchmark 回测失败时应降级为空结果', async () => {
      mockPriceData({ SPY: { '2020-01-01': 100, '2020-01-02': 101 } });
      engineMocks.callEngineStrict
        .mockResolvedValueOnce({
          portfolio: {
            name: 'tactical',
            growthCurve: [],
            drawdownCurve: [],
            rollingReturns: [],
            annualReturns: [],
            monthlyReturns: [],
            statistics: {},
          },
          signalHistory: [],
        })
        .mockRejectedValueOnce(new Error('benchmark error'));

      const result = await executeTacticalBacktest({
        strategy,
        startDate: '2020-01-01',
        endDate: '2020-01-02',
        startingValue: 10000,
        rebalanceFrequency: 'monthly',
      });
      expect(result.benchmark).toBeDefined();
      expect(result.benchmark.growthCurve).toEqual([]);
      expect(result.benchmark.name).toBe('等权基准');
    });

    it('交易日不足 2 天时应抛出错误', async () => {
      mockPriceData({ SPY: { '2020-01-01': 100 } });
      await expect(
        executeTacticalBacktest({
          strategy,
          startDate: '2020-01-01',
          endDate: '2020-01-01',
          startingValue: 10000,
          rebalanceFrequency: 'monthly',
        }),
      ).rejects.toThrow('交易日');
    });
  });

  describe('executeGridSearch', () => {
    function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        indicator: 'sma',
        param1: { min: 10, max: 50, step: 10 },
        param2: { min: 5, max: 20, step: 5 },
        tickers: ['SPY'],
        startDate: '2020-01-01',
        endDate: '2020-12-31',
        objective: 'maxCagr',
        ...overrides,
      };
    }

    it('returns error when indicator/param1/param2 missing', async () => {
      const result = await executeGridSearch({
        tickers: ['SPY'],
        startDate: '2020-01-01',
        endDate: '2020-12-31',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('缺少必要参数: indicator, param1, param2');
    });

    it('returns error when tickers is empty', async () => {
      const result = await executeGridSearch(validBody({ tickers: [] }));
      expect(result.success).toBe(false);
      expect(result.error).toBe('请至少输入一个标的代码');
    });

    it('returns error when startDate or endDate missing', async () => {
      const result = await executeGridSearch(validBody({ startDate: undefined }));
      expect(result.success).toBe(false);
      expect(result.error).toBe('缺少起止日期');
    });

    it('returns error when total combinations exceed limit', async () => {
      const body = validBody({
        param1: { min: 1, max: 15, step: 1 },
        param2: { min: 1, max: 15, step: 1 },
      });
      const result = await executeGridSearch(body);
      expect(result.success).toBe(false);
      expect(result.error).toContain('参数组合过多');
      expect(result.error).toContain(String(MAX_GRID_COMBINATIONS));
    });

    it('returns error when price data not found', async () => {
      dataMocks.fetchHistoryData.mockResolvedValueOnce({ data: { SPY: {} }, degraded: false });
      const result = await executeGridSearch(validBody());
      expect(result.success).toBe(false);
      expect(result.error).toBe('未找到 SPY 的价格数据');
    });

    it('returns error when trading days are fewer than required', async () => {
      dataMocks.fetchHistoryData.mockResolvedValueOnce({
        data: {
          SPY: { '2020-01-01': 100, '2020-01-02': 101, '2020-01-03': 102 },
        },
        degraded: false,
      });
      const result = await executeGridSearch(validBody());
      expect(result.success).toBe(false);
      expect(result.error).toBe('有效交易日不足，无法运行网格搜索');
    });

    it('returns success on valid grid search', async () => {
      const prices: Record<string, number> = {};
      for (let d = 1; d <= 15; d++) {
        prices[`2020-01-${String(d).padStart(2, '0')}`] = 100 + d;
      }
      dataMocks.fetchHistoryData.mockResolvedValueOnce({ data: { SPY: prices }, degraded: false });
      engineMocks.callEngineStrict.mockResolvedValueOnce({ result: 'ok', combinations: 20 });

      const result = await executeGridSearch(validBody());
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as Record<string, unknown>).result).toBe('ok');
      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(
        '/api/engine/tactical-grid-search',
        expect.objectContaining({ indicator: 'sma' }),
      );
      expect(loggerMocks.info).toHaveBeenCalled();
    });
  });
});
