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
import { backtestOptimizerSchema } from '../../../packages/backend/src/schemas/optimizer.js';

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

  it.each([
    ['portfolio.assets 为空', (d: Record<string, unknown>) => { (d.portfolio as Record<string, unknown>).assets = []; }],
    ['asset 缺少 ticker', (d: Record<string, unknown>) => { (d.portfolio as Record<string, unknown>).assets = [{ weight: 100 }]; }],
    ['rebalanceFrequencies 为空数组', (d: Record<string, unknown>) => { (d.parameterSpace as Record<string, unknown>).rebalanceFrequencies = []; }],
    ['rebalanceFrequencies 含非法枚举', (d: Record<string, unknown>) => { (d.parameterSpace as Record<string, unknown>).rebalanceFrequencies = ['invalid']; }],
    ['initialCapital.step 非正数', (d: Record<string, unknown>) => { ((d.parameterSpace as Record<string, unknown>).initialCapital as Record<string, unknown>).step = 0; }],
    ['initialCapital.step 为负数', (d: Record<string, unknown>) => { ((d.parameterSpace as Record<string, unknown>).initialCapital as Record<string, unknown>).step = -1; }],
    ['objective 非法枚举', (d: Record<string, unknown>) => { d.objective = 'invalid'; }],
    ['缺少 portfolio', (d: Record<string, unknown>) => { delete d.portfolio; }],
    ['缺少 parameterSpace', (d: Record<string, unknown>) => { delete d.parameterSpace; }],
    ['缺少 parameters', (d: Record<string, unknown>) => { delete d.parameters; }],
    ['缺少 objective', (d: Record<string, unknown>) => { delete d.objective; }],
    ['rebalanceThreshold.step 非正数', (d: Record<string, unknown>) => { (d.parameterSpace as Record<string, unknown>).rebalanceThreshold = { min: 1, max: 10, step: 0 }; }],
    ['parameters.startDate 为空字符串', (d: Record<string, unknown>) => { (d.parameters as Record<string, unknown>).startDate = ''; }],
    ['parameters.baseCurrency 非法枚举', (d: Record<string, unknown>) => { (d.parameters as Record<string, unknown>).baseCurrency = 'eur'; }],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => backtestOptimizerSchema.parse(data)).toThrow();
  });

  it.each([
    ['objective 合法枚举 maxCagr', (d: Record<string, unknown>) => { d.objective = 'maxCagr'; }],
    ['objective 合法枚举 minMaxDrawdown', (d: Record<string, unknown>) => { d.objective = 'minMaxDrawdown'; }],
    ['objective 合法枚举 maxSortino', (d: Record<string, unknown>) => { d.objective = 'maxSortino'; }],
    ['rebalanceThreshold 可选字段', (d: Record<string, unknown>) => { (d.parameterSpace as Record<string, unknown>).rebalanceThreshold = { min: 1, max: 10, step: 1 }; }],
    ['constraints 可选字段', (d: Record<string, unknown>) => { d.constraints = { maxDrawdown: 0.2, minCagr: 0.05 }; }],
    ['parameters.baseCurrency 合法枚举', (d: Record<string, unknown>) => { (d.parameters as Record<string, unknown>).baseCurrency = 'usd'; }],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => backtestOptimizerSchema.parse(data)).not.toThrow();
  });
});
