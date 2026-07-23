/**
 * goalOptimizer schema 单元测试
 *
 * 企业理由：目标优化器参数校验失败会导致 Monte Carlo 模拟
 * 使用非法参数崩溃。测试覆盖：
 * - 合法输入通过校验
 * - targetAmount/initialAmount/years 非正数抛错
 * - assets 为空抛错
 * - numSimulations 非正整数抛错
 */

import { describe, it, expect } from 'vitest';
import { goalOptimizerSchema } from '../../../packages/backend/src/schemas/goalOptimizer.js';

function makeValidInput() {
  return {
    targetAmount: 1000000,
    initialAmount: 10000,
    years: 20,
    assets: [{ ticker: 'VTI', weight: 100 }],
  };
}

describe('goalOptimizerSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => goalOptimizerSchema.parse(makeValidInput())).not.toThrow();
  });

  it.each([
    ['targetAmount 为 0', (d: Record<string, unknown>) => { d.targetAmount = 0; }],
    ['targetAmount 为负数', (d: Record<string, unknown>) => { d.targetAmount = -100; }],
    ['initialAmount 为 0', (d: Record<string, unknown>) => { d.initialAmount = 0; }],
    ['initialAmount 为负数', (d: Record<string, unknown>) => { d.initialAmount = -50; }],
    ['years 为 0', (d: Record<string, unknown>) => { d.years = 0; }],
    ['years 为负数', (d: Record<string, unknown>) => { d.years = -5; }],
    ['assets 为空数组', (d: Record<string, unknown>) => { d.assets = []; }],
    ['asset 缺少 ticker', (d: Record<string, unknown>) => { d.assets = [{ weight: 100 }]; }],
    ['asset ticker 为空字符串', (d: Record<string, unknown>) => { d.assets = [{ ticker: '', weight: 100 }]; }],
    ['缺少 targetAmount', (d: Record<string, unknown>) => { delete d.targetAmount; }],
    ['缺少 initialAmount', (d: Record<string, unknown>) => { delete d.initialAmount; }],
    ['缺少 years', (d: Record<string, unknown>) => { delete d.years; }],
    ['缺少 assets', (d: Record<string, unknown>) => { delete d.assets; }],
    ['targetAmount 类型错误（字符串）', (d: Record<string, unknown>) => { d.targetAmount = '1000000'; }],
    ['numSimulations 为 0', (d: Record<string, unknown>) => { d.numSimulations = 0; }],
    ['numSimulations 为负数', (d: Record<string, unknown>) => { d.numSimulations = -100; }],
    ['numSimulations 为小数（int 约束）', (d: Record<string, unknown>) => { d.numSimulations = 1.5; }],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it.each([
    ['numSimulations 合法正整数', (d: Record<string, unknown>) => { d.numSimulations = 1000; }],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => goalOptimizerSchema.parse(data)).not.toThrow();
  });

  it('constraints 可选字段应通过校验', () => {
    const data = makeValidInput() as Record<string, unknown>;
    data.constraints = { maxDrawdown: 0.3, minSuccessRate: 0.9, maxVolatility: 0.2 };
    expect(() => goalOptimizerSchema.parse(data)).not.toThrow();
  });
});
