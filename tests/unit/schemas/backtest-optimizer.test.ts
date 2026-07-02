/**
 * backtestOptimizer schema 单元测试
 *
 * 企业理由：回测优化器参数空间校验失败会导致无效网格搜索，
 * 浪费计算资源。测试覆盖：
 * - 合法输入通过校验
 * - portfolio.assets 为空抛错
 * - parameterSpace.rebalanceFrequencies 为空抛错
 * - objective 非法枚举抛错
 * - step 非正数抛错
 */

import { describe, it, expect } from 'vitest';
import { backtestOptimizerSchema } from '../../../api/schemas/backtestOptimizer.js';

function makeValidInput() {
  return {
    portfolio: {
      assets: [{ ticker: 'AAPL', weight: 100 }],
    },
    parameterSpace: {
      rebalanceFrequencies: ['monthly', 'quarterly'],
      initialCapital: { min: 1000, max: 10000, step: 1000 },
    },
    parameters: {
      startDate: '2020-01-01',
      endDate: '2024-12-31',
    },
    objective: 'maxSharpe',
  };
}

describe('backtestOptimizerSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => backtestOptimizerSchema.parse(makeValidInput())).not.toThrow();
  });

  it('portfolio.assets 为空应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).portfolio.assets = [];
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('asset 缺少 ticker 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).portfolio.assets = [{ weight: 100 }];
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('rebalanceFrequencies 为空数组应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).parameterSpace.rebalanceFrequencies = [];
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('rebalanceFrequencies 含非法枚举应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).parameterSpace.rebalanceFrequencies = ['invalid'];
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('initialCapital.step 非正数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).parameterSpace.initialCapital.step = 0;
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('initialCapital.step 为负数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).parameterSpace.initialCapital.step = -1;
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('objective 非法枚举应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).objective = 'invalid';
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('objective 合法枚举 maxCagr 应通过', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).objective = 'maxCagr';
    expect(() => backtestOptimizerSchema.parse(data)).not.toThrow();
  });

  it('objective 合法枚举 minMaxDrawdown 应通过', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).objective = 'minMaxDrawdown';
    expect(() => backtestOptimizerSchema.parse(data)).not.toThrow();
  });

  it('objective 合法枚举 maxSortino 应通过', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).objective = 'maxSortino';
    expect(() => backtestOptimizerSchema.parse(data)).not.toThrow();
  });

  it('缺少 portfolio 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).portfolio;
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('缺少 parameterSpace 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).parameterSpace;
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('缺少 parameters 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).parameters;
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('缺少 objective 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).objective;
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('rebalanceThreshold 可选字段应通过校验', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).parameterSpace.rebalanceThreshold = {
      min: 1,
      max: 10,
      step: 1,
    };
    expect(() => backtestOptimizerSchema.parse(data)).not.toThrow();
  });

  it('rebalanceThreshold.step 非正数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).parameterSpace.rebalanceThreshold = {
      min: 1,
      max: 10,
      step: 0,
    };
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('constraints 可选字段应通过校验', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).constraints = { maxDrawdown: 0.2, minCagr: 0.05 };
    expect(() => backtestOptimizerSchema.parse(data)).not.toThrow();
  });

  it('parameters.startDate 为空字符串应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).parameters.startDate = '';
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it('parameters.baseCurrency 合法枚举应通过', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).parameters.baseCurrency = 'usd';
    expect(() => backtestOptimizerSchema.parse(data)).not.toThrow();
  });

  it('parameters.baseCurrency 非法枚举应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).parameters.baseCurrency = 'eur';
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });
});
