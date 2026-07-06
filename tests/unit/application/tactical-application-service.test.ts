/**
 * tactical-application-service 单元测试（T-30）
 */
import { describe, it, expect, vi } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../packages/backend/src/engine/tactical.js', () => ({
  collectTickers: vi.fn(() => ['SPY']),
  runTacticalBacktest: vi.fn(() => ({
    result: {
      name: 'tactical',
      growthCurve: [],
      drawdownCurve: [],
      rollingReturns: [],
      annualReturns: [],
      monthlyReturns: [],
      statistics: {},
    },
    signalHistory: [],
  })),
  computeSimpleStatistics: vi.fn(() => ({})),
  analyzeWhatIf: vi.fn(() => []),
}));

vi.mock('../../../packages/backend/src/engine/portfolio.js', () => ({
  runPortfolioBacktest: vi.fn(() => ({
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
  })),
}));

import {
  executeTacticalBacktest,
  executeTacticalWhatIf,
  saveTacticalAlertConfig,
} from '../../../packages/backend/src/application/tactical-application-service.js';
import { runPortfolioBacktest } from '../../../packages/backend/src/engine/portfolio.js';
import type { TacticalStrategy } from '../../../shared/types/tactical.js';

const strategy = {
  id: 's1',
  name: 'test',
  signals: [
    { id: 'sig1', name: 'sig', indicator: 'sma', period: 20, targetTickers: ['SPY'], weight: 100 },
  ],
} as TacticalStrategy;

describe('tactical-application-service', () => {
  it('executeTacticalBacktest 在有效数据下返回结果', () => {
    const priceData = { SPY: { '2020-01-01': 100, '2020-01-02': 101 } };
    const result = executeTacticalBacktest(
      {
        strategy,
        startDate: '2020-01-01',
        endDate: '2020-01-02',
        startingValue: 10000,
        rebalanceFrequency: 'monthly',
      },
      priceData,
    );
    expect(result.portfolio).toBeDefined();
    expect(result.benchmark).toBeDefined();
  });

  it('无效标的应抛出错误', () => {
    expect(() =>
      executeTacticalBacktest(
        {
          strategy,
          startDate: '2020-01-01',
          endDate: '2020-01-02',
          startingValue: 10000,
          rebalanceFrequency: 'monthly',
        },
        {},
      ),
    ).toThrow('无效');
  });

  it('saveTacticalAlertConfig 启用时无邮箱应抛错', () => {
    expect(() => saveTacticalAlertConfig({ enabled: true, triggers: [] })).toThrow('邮箱');
  });

  it('executeTacticalWhatIf 应委托给 analyzeWhatIf 并返回结果', () => {
    const priceData = { SPY: { '2020-01-01': 100 } };
    const result = executeTacticalWhatIf(['SPY'], strategy, priceData, '2020-01-02');
    expect(result).toEqual([]);
  });

  it('benchmark 回测失败时应降级为空结果（日志警告）', () => {
    vi.mocked(runPortfolioBacktest).mockImplementationOnce(() => {
      throw new Error('benchmark error');
    });

    const priceData = { SPY: { '2020-01-01': 100, '2020-01-02': 101 } };
    const result = executeTacticalBacktest(
      {
        strategy,
        startDate: '2020-01-01',
        endDate: '2020-01-02',
        startingValue: 10000,
        rebalanceFrequency: 'monthly',
      },
      priceData,
    );
    expect(result.benchmark).toBeDefined();
    expect(result.benchmark.growthCurve).toEqual([]);
    expect(result.benchmark.name).toBe('等权基准');
  });

  it('交易日不足 2 天时应抛出错误', () => {
    const priceData = { SPY: { '2020-01-01': 100 } };
    expect(() =>
      executeTacticalBacktest(
        {
          strategy,
          startDate: '2020-01-01',
          endDate: '2020-01-01',
          startingValue: 10000,
          rebalanceFrequency: 'monthly',
        },
        priceData,
      ),
    ).toThrow('交易日');
  });
});
