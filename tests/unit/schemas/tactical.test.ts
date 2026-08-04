import { describe, it, expect } from 'vitest';
import {
  tacticalBacktestSchema,
  tacticalWhatIfSchema,
  tacticalGridSearchSchema,
} from '../../../packages/backend/src/schemas/tactical.js';
import { set, del, mutSuite } from '../../helpers/schemaMutators.js';

function makeValidStrategy() {
  return {
    id: 'strat-1',
    name: 'Momentum Strategy',
    signals: [
      {
        id: 'sig-1',
        name: 'Golden Cross',
        conditions: [{ indicator: 'sma', period: 20, operator: 'gt', threshold: 0 }],
        targetWeights: [{ ticker: 'SPY', weight: 100 }],
      },
    ],
    aggregationMethod: 'weighted_average',
  };
}

function makeValidBacktest() {
  return {
    strategy: makeValidStrategy(),
    startDate: '2020-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    rebalanceFrequency: 'monthly',
  };
}

describe('tacticalBacktestSchema', () => {
  mutSuite(
    tacticalBacktestSchema,
    makeValidBacktest,
    [
      ['缺少 strategy', del('strategy')],
      ['strategy.id 为空', set('strategy.id', '')],
      ['signals 为空数组', set('strategy.signals', [])],
      ['conditions 为空数组', set('strategy.signals.0.conditions', [])],
      ['condition.indicator 非法', set('strategy.signals.0.conditions.0.indicator', 'invalid')],
      ['condition.operator 非法', set('strategy.signals.0.conditions.0.operator', 'invalid')],
      ['aggregationMethod 非法', set('strategy.aggregationMethod', 'invalid')],
      ['startingValue 为 0', set('startingValue', 0)],
      ['startingValue 为负数', set('startingValue', -100)],
      ['rebalanceFrequency 非法', set('rebalanceFrequency', 'invalid')],
      ['targetWeights 为空数组', set('strategy.signals.0.targetWeights', [])],
    ],
    [['rankingConfig 合法', set('strategy.rankingConfig', { method: 'fixed_share', topN: 3 })]],
  );
});

describe('tacticalWhatIfSchema', () => {
  it.each([
    ['仅 tickers', { tickers: ['AAPL', 'MSFT'] }],
    ['strategy 可选', { tickers: ['AAPL'], strategy: makeValidStrategy() }],
    ['endDate 合法', { tickers: ['AAPL'], endDate: '2024-12-31' }],
  ])('合法输入（%s）应通过校验', (_n, data) => {
    expect(() => tacticalWhatIfSchema.parse(data)).not.toThrow();
  });

  it.each([
    ['tickers 为空数组', { tickers: [] }],
    ['endDate 非日期', { tickers: ['AAPL'], endDate: 'not-a-date' }],
  ])('%s 应抛错', (_n, data) => {
    expect(() => tacticalWhatIfSchema.parse(data)).toThrow();
  });

  it('缺少 tickers 应抛错', () => {
    expect(() => tacticalWhatIfSchema.parse({})).toThrow();
  });
});

function makeValidInput() {
  return {
    indicator: 'sma',
    param1: { min: 5, max: 50, step: 5 },
    param2: { min: 10, max: 100, step: 10 },
    tickers: ['AAPL', 'MSFT'],
    startDate: '2020-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    rebalanceFrequency: 'monthly',
    objective: 'maxCAGR',
  };
}

describe('tacticalGridSearchSchema', () => {
  mutSuite(
    tacticalGridSearchSchema,
    makeValidInput,
    [
      ['indicator 非法枚举', set('indicator', 'invalid')],
      ['param1.step 为 0', set('param1.step', 0)],
      ['param1.step 为负数', set('param1.step', -1)],
      ['param2.step 为 0', set('param2.step', 0)],
      ['param2.step 为负数', set('param2.step', -5)],
      ['缺少 param1', del('param1')],
      ['缺少 param2', del('param2')],
      ['tickers 为空数组', set('tickers', [])],
      ['缺少 tickers', del('tickers')],
      ['startDate 为空字符串', set('startDate', '')],
      ['startDate 非日期格式', set('startDate', 'not-a-date')],
      ['endDate 非日期格式', set('endDate', '2024/12/31')],
      ['startingValue 为 0', set('startingValue', 0)],
      ['startingValue 为负数', set('startingValue', -100)],
      ['rebalanceFrequency 非法枚举', set('rebalanceFrequency', 'invalid')],
      ['objective 非法枚举', set('objective', 'invalid')],
      ['topN 为 0', set('topN', 0)],
      ['topN 为小数（int 约束）', set('topN', 1.5)],
    ],
    [
      ['indicator=ema', set('indicator', 'ema')],
      ['indicator=rsi', set('indicator', 'rsi')],
      ['objective=minDrawdown', set('objective', 'minDrawdown')],
      ['objective=maxSharpe', set('objective', 'maxSharpe')],
      ['topN 合法正整数', set('topN', 5)],
    ],
  );
});
