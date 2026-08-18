import '../../helpers/loggerMock.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { engineMocks } from '../../helpers/engineFixture.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';
import {
  dataFacadeMocks,
  mockEngine,
  mockFetchHistoryData,
  resetAppServiceMocks,
} from '../../helpers/appServiceFixture.js';
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '@backtest/shared/types/signal.js';
import type { TacticalStrategy } from '@backtest/shared/types/tactical.js';

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
import { executeGridSearch } from '../../../packages/backend/src/application/grid-application-service.js';
import {
  signalResultSchema,
  tacticalGridResultSchema,
} from '../../../packages/backend/src/schemas/engineSchemas.js';

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

const signalReq: SignalAnalysisRequest = {
  ticker: 'AAPL',
  indicator: 'SMA',
  period: 20,
  threshold: 0.02,
  startDate: '2020-01-01',
  endDate: '2020-12-31',
  signalType: 'both',
};

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

const signalCases = [
  {
    mode: 'single',
    run: () => executeSignalAnalyze(signalReq),
    payload: { single: signalReq },
    history: { AAPL: { '2020-01-02': 100 } },
    errorMsg: 'Price data not found for: AAPL',
  },
  {
    mode: 'dual',
    run: () => executeDualSignalAnalyze(dualReq),
    payload: { dual: dualReq },
    history: { AAPL: { '2020-01-02': 100 }, SPY: { '2020-01-02': 300 } },
    errorMsg: 'Price data not found for',
  },
  {
    mode: 'multi',
    run: () => executeMultiSignalAnalyze(multiReq),
    payload: { multi: multiReq },
    history: { AAPL: { '2020-01-02': 100 } },
    errorMsg: '[signal/multi] Price data not found for',
  },
];

describe('strategy-application-services', () => {
  beforeEach(() => resetAppServiceMocks());

  describe.each(signalCases)(
    '$mode signal analyze',
    ({ mode, run, payload, history, errorMsg }) => {
      it('应使用正确参数调用引擎并返回结果', async () => {
        mockFetchHistoryData(history);
        mockEngine(mockSignalResult);

        const result = await run();

        expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(
          '/api/engine/signal-analyze',
          {
            mode,
            ...payload,
            priceData: history,
          },
          signalResultSchema[mode as keyof typeof signalResultSchema],
        );
        expect((result as { data: unknown }).data).toBe(mockSignalResult);
      });

      it('无价格数据时应抛出错误', async () => {
        mockFetchHistoryData({});

        await expect(run()).rejects.toThrow(errorMsg);
      });
    },
  );

  it("'multi' 任一信号缺价都应抛错（不只校验首个信号）", async () => {
    const req: MultiSignalConfig = {
      ...multiReq,
      signals: [
        { ...multiReq.signals[0], ticker: 'AAPL' },
        { ...multiReq.signals[1], ticker: 'MSFT' },
      ],
    };
    mockFetchHistoryData({ AAPL: { '2020-01-02': 100 } });
    await expect(executeMultiSignalAnalyze(req)).rejects.toThrow('MSFT');
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
    const backtestParams = {
      strategy,
      startDate: '2020-01-01',
      endDate: '2020-01-02',
      startingValue: 10000,
      rebalanceFrequency: 'monthly' as const,
    };

    function emptyPortfolio(name: string) {
      return {
        name,
        growthCurve: [],
        drawdownCurve: [],
        rollingReturns: [],
        annualReturns: [],
        monthlyReturns: [],
        statistics: {},
      };
    }

    it('collectTickers 从策略中提取去重 ticker', () => {
      expect(collectTickers(strategy)).toEqual(['SPY']);
    });

    it('executeTacticalBacktest 在有效数据下返回结果', async () => {
      mockFetchHistoryData({ SPY: { '2020-01-01': 100, '2020-01-02': 101 } });
      engineMocks.callEngineStrict
        .mockResolvedValueOnce({ portfolio: emptyPortfolio('tactical'), signalHistory: [] })
        .mockResolvedValueOnce({ portfolios: [emptyPortfolio('bench')] });

      const result = await executeTacticalBacktest(backtestParams);
      expect(result.data.portfolio).toBeDefined();
      expect(result.data.benchmark).toBeDefined();
    });

    it('executeTacticalWhatIf 应返回信号状态与当前价格', async () => {
      mockFetchHistoryData({ SPY: { '2020-01-01': 100, '2020-01-02': 101 } });
      engineMocks.callEngineStrict.mockResolvedValueOnce({
        signalHistory: [
          {
            date: '2020-01-02',
            activeSignals: ['sig'],
            weights: [{ ticker: 'SPY', weight: 100 }],
          },
        ],
      });

      const result = await executeTacticalWhatIf(['SPY'], strategy);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].ticker).toBe('SPY');
      expect(result.data[0].signalType).toBe('buy');
      expect(result.data[0].signalDate).toBe('2020-01-02');
      expect(result.data[0].currentPrice).toBe(101);
    });

    it('benchmark 回测失败时应 fail-closed（ADR-008，不再降级为空结果）', async () => {
      mockFetchHistoryData({ SPY: { '2020-01-01': 100, '2020-01-02': 101 } });
      engineMocks.callEngineStrict
        .mockResolvedValueOnce({ portfolio: emptyPortfolio('tactical'), signalHistory: [] })
        .mockRejectedValueOnce(new Error('benchmark error'));

      await expect(executeTacticalBacktest(backtestParams)).rejects.toThrow('benchmark error');
    });

    it.each<{
      name: string;
      data: Record<string, Record<string, number>>;
      dates: [string, string];
      msg: string;
    }>([
      {
        name: '无效标的应抛出错误',
        data: {},
        dates: ['2020-01-01', '2020-01-02'],
        msg: 'Price data not found for',
      },
      {
        name: '交易日不足 2 天时应抛出错误',
        data: { SPY: { '2020-01-01': 100 } },
        dates: ['2020-01-01', '2020-01-01'],
        msg: '交易日',
      },
    ])('$name', async ({ data, dates, msg }) => {
      mockFetchHistoryData(data);
      await expect(
        executeTacticalBacktest({ ...backtestParams, startDate: dates[0], endDate: dates[1] }),
      ).rejects.toThrow(msg);
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
      await expect(
        executeGridSearch({
          tickers: ['SPY'],
          startDate: '2020-01-01',
          endDate: '2020-12-31',
        }),
      ).rejects.toThrow('缺少必要参数: indicator, param1, param2');
    });

    it('returns error when tickers is empty', async () => {
      await expect(executeGridSearch(validBody({ tickers: [] }))).rejects.toThrow(
        '请至少输入一个标的代码',
      );
    });

    it('returns error when startDate or endDate missing', async () => {
      await expect(executeGridSearch(validBody({ startDate: undefined }))).rejects.toThrow(
        '缺少起止日期',
      );
    });

    it('returns error when total combinations exceed limit', async () => {
      const body = validBody({
        param1: { min: 1, max: 15, step: 1 },
        param2: { min: 1, max: 15, step: 1 },
      });
      await expect(executeGridSearch(body)).rejects.toThrow(/参数组合过多/);
    });

    it('returns error when price data not found', async () => {
      dataFacadeMocks.fetchHistoryData.mockResolvedValueOnce({
        data: { SPY: {} },
        degraded: false,
      });
      await expect(executeGridSearch(validBody())).rejects.toThrow('未找到 SPY 的价格数据');
    });

    it('returns error when trading days are fewer than required', async () => {
      dataFacadeMocks.fetchHistoryData.mockResolvedValueOnce({
        data: {
          SPY: { '2020-01-01': 100, '2020-01-02': 101, '2020-01-03': 102 },
        },
        degraded: false,
      });
      await expect(executeGridSearch(validBody())).rejects.toThrow(
        '有效交易日不足，无法运行网格搜索',
      );
    });

    it('returns success on valid grid search', async () => {
      const prices: Record<string, number> = {};
      for (let d = 1; d <= 15; d++) {
        prices[`2020-01-${String(d).padStart(2, '0')}`] = 100 + d;
      }
      dataFacadeMocks.fetchHistoryData.mockResolvedValueOnce({
        data: { SPY: prices },
        degraded: false,
      });
      mockEngine({ result: 'ok', combinations: 20 });

      const result = await executeGridSearch(validBody());
      expect(result.data).toBeDefined();
      expect((result.data as Record<string, unknown>).result).toBe('ok');
      expect(engineMocks.callEngineStrict).toHaveBeenCalledWith(
        '/api/engine/tactical-grid-search',
        expect.objectContaining({ indicator: 'sma' }),
        tacticalGridResultSchema,
      );
      expect(loggerMocks.info).toHaveBeenCalled();
    });
  });
});
