import '../../helpers/loggerMock.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { engineMocks } from '../../helpers/engineFixture.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';
import { mockPortfolioResult } from '../../helpers/storeFixtures.js';
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
import type { TacticalGridRequest } from '../../../packages/backend/src/application/grid-application-service.js';
import {
  signalResultSchema,
  tacticalGridResultSchema,
} from '../../../packages/backend/src/schemas/engineSchemas.js';

const mockSignalResult = {
  signals: [
    { date: '2020-01-03', type: 'buy' as const, price: 101 },
    { date: '2020-01-06', type: 'sell' as const, price: 102 },
  ],
  statistics: { totalSignals: 2, winRate: 0.5, avgReturn: 0.02, maxDrawdown: 0.05, sharpe: 1.2 },
  equityCurve: [
    { date: '2020-01-02', value: 100 },
    { date: '2020-01-06', value: 105 },
  ],
};

const rsi: Partial<SignalAnalysisRequest> = { indicator: 'RSI', period: 14, threshold: 30 };
const base = { ticker: 'AAPL', indicator: 'SMA', period: 20, threshold: 0.02 };
const mkSignal = (o: Partial<SignalAnalysisRequest> = {}): SignalAnalysisRequest => ({
  ...base,
  startDate: '2020-01-01',
  endDate: '2020-12-31',
  signalType: 'both',
  ...o,
});

const signalReq = mkSignal();
const dualReq: DualSignalConfig = {
  signal1: mkSignal({ signalType: 'entry' }),
  signal2: mkSignal({ ticker: 'SPY', ...rsi, signalType: 'entry' }),
  combinationMethod: 'and',
};
const multiReq: MultiSignalConfig = {
  signals: [mkSignal(), mkSignal(rsi)],
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
          { mode, ...payload, priceData: history },
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
    mockFetchHistoryData({ AAPL: { '2020-01-02': 100 } });
    await expect(
      executeMultiSignalAnalyze({
        ...multiReq,
        signals: [multiReq.signals[0], { ...multiReq.signals[1], ticker: 'MSFT' }],
      }),
    ).rejects.toThrow('MSFT');
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

    const emptyPortfolio = (name: string) =>
      mockPortfolioResult({ name, growthCurve: [], drawdownCurve: [] });

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
      const active = {
        date: '2020-01-02',
        activeSignals: ['sig'],
        weights: [{ ticker: 'SPY', weight: 100 }],
      };
      engineMocks.callEngineStrict.mockResolvedValueOnce({ signalHistory: [active] });
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

    it.each<{ n: string; d: unknown; e: string; m: string }>([
      { n: '无效标的应抛出错误', d: {}, e: '2020-01-02', m: 'Price data not found for' },
      {
        n: '交易日不足 2 天时应抛出错误',
        d: { SPY: { '2020-01-01': 100 } },
        e: '2020-01-01',
        m: '交易日',
      },
    ])('$n', async ({ d, e, m }) => {
      mockFetchHistoryData(d);
      await expect(executeTacticalBacktest({ ...backtestParams, endDate: e })).rejects.toThrow(m);
    });
  });

  describe('executeGridSearch', () => {
    // 错误路径用例故意传非法/缺省 body，测试边界处显式放宽类型
    const grid = (b: Record<string, unknown>) =>
      executeGridSearch(b as unknown as TacticalGridRequest);
    const validBody = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
      indicator: 'sma',
      param1: { min: 10, max: 50, step: 10 },
      param2: { min: 5, max: 20, step: 5 },
      tickers: ['SPY'],
      startDate: '2020-01-01',
      endDate: '2020-12-31',
      objective: 'maxCagr',
      ...o,
    });
    const priceData = (data: unknown) =>
      dataFacadeMocks.fetchHistoryData.mockResolvedValueOnce({ data, degraded: false });

    it('returns error when indicator/param1/param2 missing', async () => {
      await expect(
        grid({ tickers: ['SPY'], startDate: '2020-01-01', endDate: '2020-12-31' }),
      ).rejects.toThrow('缺少必要参数: indicator, param1, param2');
    });

    it('returns error when tickers is empty', async () => {
      await expect(grid(validBody({ tickers: [] }))).rejects.toThrow('请至少输入一个标的代码');
    });

    it('returns error when startDate or endDate missing', async () => {
      await expect(grid(validBody({ startDate: undefined }))).rejects.toThrow('缺少起止日期');
    });

    it('returns error when total combinations exceed limit', async () => {
      const big = { min: 1, max: 15, step: 1 };
      await expect(grid(validBody({ param1: big, param2: big }))).rejects.toThrow(/参数组合过多/);
    });

    it('returns error when price data not found', async () => {
      priceData({ SPY: {} });
      await expect(grid(validBody())).rejects.toThrow('未找到 SPY 的价格数据');
    });

    it('returns error when trading days are fewer than required', async () => {
      priceData({ SPY: { '2020-01-01': 100, '2020-01-02': 101, '2020-01-03': 102 } });
      await expect(grid(validBody())).rejects.toThrow('有效交易日不足，无法运行网格搜索');
    });

    it('returns success on valid grid search', async () => {
      const prices = Object.fromEntries(
        Array.from({ length: 15 }, (_, d): [string, number] => [
          `2020-01-${String(d + 1).padStart(2, '0')}`,
          101 + d,
        ]),
      );
      priceData({ SPY: prices });
      mockEngine({ result: 'ok', combinations: 20 });
      const result = await grid(validBody());
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
