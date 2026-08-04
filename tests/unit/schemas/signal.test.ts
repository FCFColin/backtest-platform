import { describe, it, expect } from 'vitest';
import {
  signalAnalyzeSchema,
  signalDualSchema,
  signalMultiSchema,
} from '../../../packages/backend/src/schemas/analysisSchemas.js';
import { set, del, mutSuite } from '../../helpers/schemaMutators.js';

function makeValidSignal() {
  return {
    ticker: 'AAPL',
    indicator: 'sma',
    period: 20,
    threshold: 0,
    startDate: '2020-01-01',
    endDate: '2024-12-31',
    signalType: 'entry',
  };
}

describe('signalAnalyzeSchema', () => {
  mutSuite(
    signalAnalyzeSchema,
    makeValidSignal,
    [
      ['缺少 ticker', del('ticker')],
      ['ticker 为空字符串', set('ticker', '')],
      ['缺少 indicator', del('indicator')],
      ['indicator 为空字符串', set('indicator', '')],
      ['缺少 period', del('period')],
      ['period 类型错误（字符串）', set('period', '20')],
      ['缺少 threshold', del('threshold')],
      ['signalType 非法枚举', set('signalType', 'invalid')],
      ['startDate 为空字符串', set('startDate', '')],
      ['endDate 为空字符串', set('endDate', '')],
    ],
    [
      ['signalType=exit', set('signalType', 'exit')],
      ['signalType=both', set('signalType', 'both')],
    ],
  );
});

describe('signalDualSchema', () => {
  mutSuite(
    signalDualSchema,
    () => ({
      signal1: makeValidSignal(),
      signal2: { ...makeValidSignal(), indicator: 'ema' },
      combinationMethod: 'and',
    }),
    [
      ['缺少 signal1', del('signal1')],
      ['缺少 signal2', del('signal2')],
      ['combinationMethod 非法枚举', set('combinationMethod', 'invalid')],
      ['signal1 内部字段非法', set('signal1.signalType', 'invalid')],
    ],
    [['combinationMethod=xor', set('combinationMethod', 'xor')]],
  );
});

describe('signalMultiSchema', () => {
  mutSuite(
    signalMultiSchema,
    () => ({ signals: [makeValidSignal()], aggregationMethod: 'voting' }),
    [
      ['signals 为空数组', set('signals', [])],
      ['aggregationMethod 非法枚举', set('aggregationMethod', 'invalid')],
      ['signals 内部字段非法', set('signals.0.signalType', 'invalid')],
    ],
    [
      ['aggregationMethod=weighted', set('aggregationMethod', 'weighted')],
      ['aggregationMethod=rank', set('aggregationMethod', 'rank')],
    ],
  );

  it.each([
    [
      'weights 可选字段',
      {
        signals: [makeValidSignal(), makeValidSignal()],
        aggregationMethod: 'weighted',
        weights: [0.6, 0.4],
      },
    ],
    [
      '多个 signals 应通过校验',
      {
        signals: [
          makeValidSignal(),
          { ...makeValidSignal(), indicator: 'rsi' },
          { ...makeValidSignal(), indicator: 'macd' },
        ],
        aggregationMethod: 'voting',
      },
    ],
  ])('%s', (_n, data) => {
    expect(() => signalMultiSchema.parse(data)).not.toThrow();
  });
});
