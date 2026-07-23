/**
 * tacticalGrid schema 单元测试
 *
 * 企业理由：战术网格搜索参数空间校验失败会导致无效参数组合，
 * 浪费计算资源。测试覆盖：
 * - 合法输入通过校验
 * - param1/param2.step 非正数抛错
 * - indicator 非法枚举抛错
 * - startingValue 非正数抛错
 * - 日期格式校验
 */

import { describe, it, expect } from 'vitest';
import { tacticalGridSearchSchema } from '../../../packages/backend/src/schemas/tactical.js';

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
  it('合法输入应通过校验', () => {
    expect(() => tacticalGridSearchSchema.parse(makeValidInput())).not.toThrow();
  });

  it.each([
    ['indicator 非法枚举', (d: Record<string, unknown>) => { d.indicator = 'invalid'; }],
    ['param1.step 为 0', (d: Record<string, unknown>) => { (d.param1 as Record<string, unknown>).step = 0; }],
    ['param1.step 为负数', (d: Record<string, unknown>) => { (d.param1 as Record<string, unknown>).step = -1; }],
    ['param2.step 为 0', (d: Record<string, unknown>) => { (d.param2 as Record<string, unknown>).step = 0; }],
    ['param2.step 为负数', (d: Record<string, unknown>) => { (d.param2 as Record<string, unknown>).step = -5; }],
    ['缺少 param1', (d: Record<string, unknown>) => { delete d.param1; }],
    ['缺少 param2', (d: Record<string, unknown>) => { delete d.param2; }],
    ['tickers 为空数组', (d: Record<string, unknown>) => { d.tickers = []; }],
    ['缺少 tickers', (d: Record<string, unknown>) => { delete d.tickers; }],
    ['startDate 为空字符串', (d: Record<string, unknown>) => { d.startDate = ''; }],
    ['startDate 非日期格式', (d: Record<string, unknown>) => { d.startDate = 'not-a-date'; }],
    ['endDate 非日期格式', (d: Record<string, unknown>) => { d.endDate = '2024/12/31'; }],
    ['startingValue 为 0', (d: Record<string, unknown>) => { d.startingValue = 0; }],
    ['startingValue 为负数', (d: Record<string, unknown>) => { d.startingValue = -100; }],
    ['rebalanceFrequency 非法枚举', (d: Record<string, unknown>) => { d.rebalanceFrequency = 'invalid'; }],
    ['objective 非法枚举', (d: Record<string, unknown>) => { d.objective = 'invalid'; }],
    ['topN 为 0', (d: Record<string, unknown>) => { d.topN = 0; }],
    ['topN 为小数（int 约束）', (d: Record<string, unknown>) => { d.topN = 1.5; }],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it.each([
    ['indicator=ema', (d: Record<string, unknown>) => { d.indicator = 'ema'; }],
    ['indicator=rsi', (d: Record<string, unknown>) => { d.indicator = 'rsi'; }],
    ['objective=minDrawdown', (d: Record<string, unknown>) => { d.objective = 'minDrawdown'; }],
    ['objective=maxSharpe', (d: Record<string, unknown>) => { d.objective = 'maxSharpe'; }],
    ['topN 可选字段合法正整数', (d: Record<string, unknown>) => { d.topN = 5; }],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => tacticalGridSearchSchema.parse(data)).not.toThrow();
  });
});
