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
import { goalOptimizerSchema } from '../../../api/schemas/goalOptimizer.js';

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

  it('targetAmount 为 0 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).targetAmount = 0;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('targetAmount 为负数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).targetAmount = -100;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('initialAmount 为 0 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).initialAmount = 0;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('initialAmount 为负数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).initialAmount = -50;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('years 为 0 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).years = 0;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('years 为负数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).years = -5;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('assets 为空数组应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).assets = [];
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('asset 缺少 ticker 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).assets = [{ weight: 100 }];
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('asset ticker 为空字符串应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).assets = [{ ticker: '', weight: 100 }];
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('缺少 targetAmount 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).targetAmount;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('缺少 initialAmount 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).initialAmount;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('缺少 years 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).years;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('缺少 assets 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).assets;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('targetAmount 类型错误（字符串）应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).targetAmount = '1000000';
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('numSimulations 合法正整数应通过', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).numSimulations = 1000;
    expect(() => goalOptimizerSchema.parse(data)).not.toThrow();
  });

  it('numSimulations 为 0 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).numSimulations = 0;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('numSimulations 为负数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).numSimulations = -100;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('numSimulations 为小数应抛错（int 约束）', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).numSimulations = 1.5;
    expect(() => goalOptimizerSchema.parse(data)).toThrow();
  });

  it('constraints 可选字段应通过校验', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).constraints = {
      maxDrawdown: 0.3,
      minSuccessRate: 0.9,
      maxVolatility: 0.2,
    };
    expect(() => goalOptimizerSchema.parse(data)).not.toThrow();
  });
});
