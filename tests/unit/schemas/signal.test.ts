/**
 * signal schema 单元测试
 *
 * 企业理由：信号分析参数校验失败会导致指标计算错误，
 * 影响交易信号准确性。测试覆盖：
 * - signalAnalyzeSchema 合法/非法输入
 * - signalDualSchema 双信号组合校验
 * - signalMultiSchema 多信号聚合校验
 * - 枚举值校验（signalType/combinationMethod/aggregationMethod）
 */

import { describe, it, expect } from 'vitest';
import {
  signalAnalyzeSchema,
  signalDualSchema,
  signalMultiSchema,
} from '../../../packages/backend/src/schemas/signal.js';

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
  it('合法输入应通过校验', () => {
    expect(() => signalAnalyzeSchema.parse(makeValidSignal())).not.toThrow();
  });

  it.each([
    ['缺少 ticker', (d: Record<string, unknown>) => { delete d.ticker; }],
    ['ticker 为空字符串', (d: Record<string, unknown>) => { d.ticker = ''; }],
    ['缺少 indicator', (d: Record<string, unknown>) => { delete d.indicator; }],
    ['indicator 为空字符串', (d: Record<string, unknown>) => { d.indicator = ''; }],
    ['缺少 period', (d: Record<string, unknown>) => { delete d.period; }],
    ['period 类型错误（字符串）', (d: Record<string, unknown>) => { d.period = '20'; }],
    ['缺少 threshold', (d: Record<string, unknown>) => { delete d.threshold; }],
    ['signalType 非法枚举', (d: Record<string, unknown>) => { d.signalType = 'invalid'; }],
    ['startDate 为空字符串', (d: Record<string, unknown>) => { d.startDate = ''; }],
    ['endDate 为空字符串', (d: Record<string, unknown>) => { d.endDate = ''; }],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makeValidSignal() as Record<string, unknown>;
    mutate(data);
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
  });

  it.each([
    ['signalType=exit', (d: Record<string, unknown>) => { d.signalType = 'exit'; }],
    ['signalType=both', (d: Record<string, unknown>) => { d.signalType = 'both'; }],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makeValidSignal() as Record<string, unknown>;
    mutate(data);
    expect(() => signalAnalyzeSchema.parse(data)).not.toThrow();
  });
});

describe('signalDualSchema', () => {
  it('合法输入应通过校验', () => {
    const data = {
      signal1: makeValidSignal(),
      signal2: { ...makeValidSignal(), indicator: 'ema' },
      combinationMethod: 'and',
    };
    expect(() => signalDualSchema.parse(data)).not.toThrow();
  });

  it.each([
    ['缺少 signal1', (d: Record<string, unknown>) => { delete d.signal1; }],
    ['缺少 signal2', (d: Record<string, unknown>) => { delete d.signal2; }],
  ])('%s 应抛错', (_name, mutate) => {
    const data = {
      signal1: makeValidSignal(),
      signal2: makeValidSignal(),
      combinationMethod: 'or',
    } as Record<string, unknown>;
    mutate(data);
    expect(() => signalDualSchema.parse(data)).toThrow();
  });

  it('combinationMethod 非法枚举应抛错', () => {
    const data = {
      signal1: makeValidSignal(),
      signal2: makeValidSignal(),
      combinationMethod: 'invalid',
    };
    expect(() => signalDualSchema.parse(data)).toThrow();
  });

  it('combinationMethod=xor 应通过校验', () => {
    const data = {
      signal1: makeValidSignal(),
      signal2: makeValidSignal(),
      combinationMethod: 'xor',
    };
    expect(() => signalDualSchema.parse(data)).not.toThrow();
  });

  it('signal1 内部字段非法应抛错', () => {
    const data = {
      signal1: { ...makeValidSignal(), signalType: 'invalid' },
      signal2: makeValidSignal(),
      combinationMethod: 'and',
    };
    expect(() => signalDualSchema.parse(data)).toThrow();
  });
});

describe('signalMultiSchema', () => {
  it('合法输入应通过校验', () => {
    const data = {
      signals: [makeValidSignal()],
      aggregationMethod: 'voting',
    };
    expect(() => signalMultiSchema.parse(data)).not.toThrow();
  });

  it.each([
    ['signals 为空数组', (d: Record<string, unknown>) => { d.signals = []; }],
    ['aggregationMethod 非法枚举', (d: Record<string, unknown>) => { d.aggregationMethod = 'invalid'; }],
  ])('%s 应抛错', (_name, mutate) => {
    const data = { signals: [makeValidSignal()], aggregationMethod: 'voting' } as Record<string, unknown>;
    mutate(data);
    expect(() => signalMultiSchema.parse(data)).toThrow();
  });

  it.each([
    ['aggregationMethod=weighted', (d: Record<string, unknown>) => { d.aggregationMethod = 'weighted'; }],
    ['aggregationMethod=rank', (d: Record<string, unknown>) => { d.aggregationMethod = 'rank'; }],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = { signals: [makeValidSignal()], aggregationMethod: 'voting' } as Record<string, unknown>;
    mutate(data);
    expect(() => signalMultiSchema.parse(data)).not.toThrow();
  });

  it('weights 可选字段应通过校验', () => {
    const data = {
      signals: [makeValidSignal(), makeValidSignal()],
      aggregationMethod: 'weighted',
      weights: [0.6, 0.4],
    };
    expect(() => signalMultiSchema.parse(data)).not.toThrow();
  });

  it('多个 signals 应通过校验', () => {
    const data = {
      signals: [
        makeValidSignal(),
        { ...makeValidSignal(), indicator: 'rsi' },
        { ...makeValidSignal(), indicator: 'macd' },
      ],
      aggregationMethod: 'voting',
    };
    expect(() => signalMultiSchema.parse(data)).not.toThrow();
  });

  it('signals 内部字段非法应抛错', () => {
    const data = {
      signals: [{ ...makeValidSignal(), signalType: 'invalid' }],
      aggregationMethod: 'voting',
    };
    expect(() => signalMultiSchema.parse(data)).toThrow();
  });
});
