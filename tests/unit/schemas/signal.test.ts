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
} from '../../../api/schemas/signal.js';

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

  it('缺少 ticker 应抛错', () => {
    const data = makeValidSignal();
    delete (data as Record<string, unknown>).ticker;
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
  });

  it('ticker 为空字符串应抛错', () => {
    const data = makeValidSignal();
    (data as Record<string, unknown>).ticker = '';
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
  });

  it('缺少 indicator 应抛错', () => {
    const data = makeValidSignal();
    delete (data as Record<string, unknown>).indicator;
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
  });

  it('indicator 为空字符串应抛错', () => {
    const data = makeValidSignal();
    (data as Record<string, unknown>).indicator = '';
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
  });

  it('缺少 period 应抛错', () => {
    const data = makeValidSignal();
    delete (data as Record<string, unknown>).period;
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
  });

  it('period 类型错误（字符串）应抛错', () => {
    const data = makeValidSignal();
    (data as Record<string, unknown>).period = '20';
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
  });

  it('缺少 threshold 应抛错', () => {
    const data = makeValidSignal();
    delete (data as Record<string, unknown>).threshold;
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
  });

  it('signalType 非法枚举应抛错', () => {
    const data = makeValidSignal();
    (data as Record<string, unknown>).signalType = 'invalid';
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
  });

  it('signalType=exit 应通过校验', () => {
    const data = makeValidSignal();
    (data as Record<string, unknown>).signalType = 'exit';
    expect(() => signalAnalyzeSchema.parse(data)).not.toThrow();
  });

  it('signalType=both 应通过校验', () => {
    const data = makeValidSignal();
    (data as Record<string, unknown>).signalType = 'both';
    expect(() => signalAnalyzeSchema.parse(data)).not.toThrow();
  });

  it('startDate 为空字符串应抛错', () => {
    const data = makeValidSignal();
    (data as Record<string, unknown>).startDate = '';
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
  });

  it('endDate 为空字符串应抛错', () => {
    const data = makeValidSignal();
    (data as Record<string, unknown>).endDate = '';
    expect(() => signalAnalyzeSchema.parse(data)).toThrow();
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

  it('缺少 signal1 应抛错', () => {
    const data = {
      signal2: makeValidSignal(),
      combinationMethod: 'or',
    };
    expect(() => signalDualSchema.parse(data)).toThrow();
  });

  it('缺少 signal2 应抛错', () => {
    const data = {
      signal1: makeValidSignal(),
      combinationMethod: 'or',
    };
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

  it('signals 为空数组应抛错', () => {
    const data = {
      signals: [],
      aggregationMethod: 'voting',
    };
    expect(() => signalMultiSchema.parse(data)).toThrow();
  });

  it('aggregationMethod 非法枚举应抛错', () => {
    const data = {
      signals: [makeValidSignal()],
      aggregationMethod: 'invalid',
    };
    expect(() => signalMultiSchema.parse(data)).toThrow();
  });

  it('aggregationMethod=weighted 应通过校验', () => {
    const data = {
      signals: [makeValidSignal()],
      aggregationMethod: 'weighted',
    };
    expect(() => signalMultiSchema.parse(data)).not.toThrow();
  });

  it('aggregationMethod=rank 应通过校验', () => {
    const data = {
      signals: [makeValidSignal()],
      aggregationMethod: 'rank',
    };
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
