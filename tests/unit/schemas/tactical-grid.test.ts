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
import { tacticalGridSearchSchema } from '../../../packages/backend/src/schemas/tacticalGrid.js';

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

  it('indicator 非法枚举应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).indicator = 'invalid';
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('indicator=ema 应通过校验', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).indicator = 'ema';
    expect(() => tacticalGridSearchSchema.parse(data)).not.toThrow();
  });

  it('indicator=rsi 应通过校验', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).indicator = 'rsi';
    expect(() => tacticalGridSearchSchema.parse(data)).not.toThrow();
  });

  it('param1.step 为 0 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).param1.step = 0;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('param1.step 为负数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).param1.step = -1;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('param2.step 为 0 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).param2.step = 0;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('param2.step 为负数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).param2.step = -5;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('缺少 param1 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).param1;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('缺少 param2 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).param2;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('tickers 为空数组应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).tickers = [];
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('缺少 tickers 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).tickers;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('startDate 为空字符串应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).startDate = '';
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('startDate 非日期格式应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).startDate = 'not-a-date';
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('endDate 非日期格式应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).endDate = '2024/12/31';
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('startingValue 为 0 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).startingValue = 0;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('startingValue 为负数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).startingValue = -100;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('rebalanceFrequency 非法枚举应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).rebalanceFrequency = 'invalid';
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('objective 非法枚举应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).objective = 'invalid';
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('objective=minDrawdown 应通过校验', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).objective = 'minDrawdown';
    expect(() => tacticalGridSearchSchema.parse(data)).not.toThrow();
  });

  it('objective=maxSharpe 应通过校验', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).objective = 'maxSharpe';
    expect(() => tacticalGridSearchSchema.parse(data)).not.toThrow();
  });

  it('topN 可选字段合法正整数应通过', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).topN = 5;
    expect(() => tacticalGridSearchSchema.parse(data)).not.toThrow();
  });

  it('topN 为 0 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).topN = 0;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });

  it('topN 为小数应抛错（int 约束）', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).topN = 1.5;
    expect(() => tacticalGridSearchSchema.parse(data)).toThrow();
  });
});
