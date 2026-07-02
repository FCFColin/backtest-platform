/**
 * tactical-application-service 单元测试（T-30）
 */
import { describe, it, expect, vi } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../api/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../api/engine/tactical.js', () => ({
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

vi.mock('../../../api/engine/portfolio.js', () => ({
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
  saveTacticalAlertConfig,
} from '../../../api/application/tactical-application-service.js';
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
});

