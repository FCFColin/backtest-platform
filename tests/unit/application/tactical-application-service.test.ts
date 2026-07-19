/**
 * tactical-application-service 单元测试（T-30）
 *
 * 引擎计算已迁移到 Go，测试 mock engineClient + fetchHistoryData 验证编排逻辑。
 * 合并后的服务函数内部完成数据获取，不再由调用方传入 priceData。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/engineRouteMocks.js';

const engineMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
}));

const dataMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
}));
vi.mock('../../../packages/backend/src/services/dataService.js', () => ({
  fetchHistoryData: dataMocks.fetchHistoryData,
}));

import {
  executeTacticalBacktest,
  executeTacticalWhatIf,
  saveTacticalAlertConfig,
  collectTickers,
} from '../../../packages/backend/src/application/tactical-application-service.js';
import type { TacticalStrategy } from '@backtest/shared/types/tactical.js';

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

describe('tactical-application-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    ).rejects.toThrow('未找到');
  });

  it('saveTacticalAlertConfig 启用时无邮箱应抛错', () => {
    expect(() => saveTacticalAlertConfig({ enabled: true, email: '', triggers: [] })).toThrow(
      '邮箱',
    );
  });

  it('executeTacticalWhatIf 应返回最近信号权重', async () => {
    mockPriceData({ SPY: { '2020-01-01': 100, '2020-01-02': 101 } });
    engineMocks.callEngineStrict.mockResolvedValueOnce({
      signalHistory: [
        { date: '2020-01-02', activeSignals: ['sig1'], weights: [{ ticker: 'SPY', weight: 100 }] },
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
