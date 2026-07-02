/**
 * tactical schema 单元测试
 *
 * 企业理由：战术分配策略校验失败会导致信号条件无法匹配，
 * 影响回测结果准确性。测试覆盖：
 * - tacticalBacktestSchema 合法/非法输入
 * - tacticalWhatIfSchema 合法/非法输入
 * - tacticalAlertSchema 合法/非法输入
 * - 嵌套对象校验（strategy/signals/conditions）
 */

import { describe, it, expect } from 'vitest';
import {
  tacticalBacktestSchema,
  tacticalWhatIfSchema,
  tacticalAlertSchema,
} from '../../../api/schemas/tactical.js';

function makeValidCondition() {
  return {
    indicator: 'sma',
    period: 20,
    operator: 'gt',
    threshold: 0,
  };
}

function makeValidTradingSignal() {
  return {
    id: 'sig-1',
    name: 'Golden Cross',
    conditions: [makeValidCondition()],
    targetWeights: [{ ticker: 'SPY', weight: 100 }],
  };
}

function makeValidStrategy() {
  return {
    id: 'strat-1',
    name: 'Momentum Strategy',
    signals: [makeValidTradingSignal()],
    aggregationMethod: 'weighted_average',
  };
}

describe('tacticalBacktestSchema', () => {
  it('合法输入应通过校验', () => {
    const data = {
      strategy: makeValidStrategy(),
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).not.toThrow();
  });

  it('缺少 strategy 应抛错', () => {
    const data = {
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });

  it('strategy.id 为空应抛错', () => {
    const data = {
      strategy: { ...makeValidStrategy(), id: '' },
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });

  it('strategy.signals 为空应抛错', () => {
    const data = {
      strategy: { ...makeValidStrategy(), signals: [] },
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });

  it('signal.conditions 为空应抛错', () => {
    const data = {
      strategy: {
        ...makeValidStrategy(),
        signals: [{ ...makeValidTradingSignal(), conditions: [] }],
      },
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });

  it('condition.indicator 非法枚举应抛错', () => {
    const data = {
      strategy: {
        ...makeValidStrategy(),
        signals: [
          {
            ...makeValidTradingSignal(),
            conditions: [{ ...makeValidCondition(), indicator: 'invalid' }],
          },
        ],
      },
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });

  it('condition.operator 非法枚举应抛错', () => {
    const data = {
      strategy: {
        ...makeValidStrategy(),
        signals: [
          {
            ...makeValidTradingSignal(),
            conditions: [{ ...makeValidCondition(), operator: 'invalid' }],
          },
        ],
      },
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });

  it('aggregationMethod 非法枚举应抛错', () => {
    const data = {
      strategy: { ...makeValidStrategy(), aggregationMethod: 'invalid' },
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });

  it('startingValue 为 0 应抛错', () => {
    const data = {
      strategy: makeValidStrategy(),
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 0,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });

  it('startingValue 为负数应抛错', () => {
    const data = {
      strategy: makeValidStrategy(),
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: -100,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });

  it('rebalanceFrequency 非法枚举应抛错', () => {
    const data = {
      strategy: makeValidStrategy(),
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'invalid',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });

  it('rankingConfig 可选字段应通过校验', () => {
    const data = {
      strategy: {
        ...makeValidStrategy(),
        rankingConfig: { method: 'fixed_share', topN: 3 },
      },
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).not.toThrow();
  });

  it('targetWeights 为空应抛错', () => {
    const data = {
      strategy: {
        ...makeValidStrategy(),
        signals: [{ ...makeValidTradingSignal(), targetWeights: [] }],
      },
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'monthly',
    };
    expect(() => tacticalBacktestSchema.parse(data)).toThrow();
  });
});

describe('tacticalWhatIfSchema', () => {
  it('合法输入（仅 tickers）应通过校验', () => {
    const data = {
      tickers: ['AAPL', 'MSFT'],
    };
    expect(() => tacticalWhatIfSchema.parse(data)).not.toThrow();
  });

  it('tickers 为空数组应抛错', () => {
    const data = {
      tickers: [],
    };
    expect(() => tacticalWhatIfSchema.parse(data)).toThrow();
  });

  it('缺少 tickers 应抛错', () => {
    expect(() => tacticalWhatIfSchema.parse({})).toThrow();
  });

  it('strategy 可选字段应通过校验', () => {
    const data = {
      tickers: ['AAPL'],
      strategy: makeValidStrategy(),
    };
    expect(() => tacticalWhatIfSchema.parse(data)).not.toThrow();
  });

  it('endDate 可选字段为合法日期应通过校验', () => {
    const data = {
      tickers: ['AAPL'],
      endDate: '2024-12-31',
    };
    expect(() => tacticalWhatIfSchema.parse(data)).not.toThrow();
  });

  it('endDate 非日期格式应抛错', () => {
    const data = {
      tickers: ['AAPL'],
      endDate: 'not-a-date',
    };
    expect(() => tacticalWhatIfSchema.parse(data)).toThrow();
  });
});

describe('tacticalAlertSchema', () => {
  it('合法输入应通过校验', () => {
    const data = {
      config: {
        enabled: true,
        email: 'test@example.com',
        triggers: ['signal_change', 'rebalance'],
      },
    };
    expect(() => tacticalAlertSchema.parse(data)).not.toThrow();
  });

  it('enabled=false 应通过校验', () => {
    const data = {
      config: { enabled: false },
    };
    expect(() => tacticalAlertSchema.parse(data)).not.toThrow();
  });

  it('缺少 config 应抛错', () => {
    expect(() => tacticalAlertSchema.parse({})).toThrow();
  });

  it('缺少 enabled 应抛错', () => {
    const data = {
      config: { email: 'test@example.com' },
    };
    expect(() => tacticalAlertSchema.parse(data)).toThrow();
  });

  it('enabled 类型错误（字符串）应抛错', () => {
    const data = {
      config: { enabled: 'true' },
    };
    expect(() => tacticalAlertSchema.parse(data)).toThrow();
  });

  it('triggers 含非法枚举应抛错', () => {
    const data = {
      config: {
        enabled: true,
        triggers: ['invalid_trigger'],
      },
    };
    expect(() => tacticalAlertSchema.parse(data)).toThrow();
  });

  it('triggers=threshold 应通过校验', () => {
    const data = {
      config: {
        enabled: true,
        triggers: ['threshold'],
      },
    };
    expect(() => tacticalAlertSchema.parse(data)).not.toThrow();
  });
});
