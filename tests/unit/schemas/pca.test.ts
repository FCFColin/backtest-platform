/**
 * pca schema 单元测试
 *
 * 企业理由：PCA 分析需要至少 2 个资产才能计算协方差矩阵，
 * 校验失败会导致线性代数运算抛出运行时异常。测试覆盖：
 * - 合法输入通过校验
 * - tickers 少于 2 个抛错
 * - 缺少日期字段抛错
 * - numComponents 非正整数抛错
 */

import { describe, it, expect } from 'vitest';
import { pcaAnalyzeSchema } from '../../../packages/backend/src/schemas/pca.js';

function makeValidInput() {
  return {
    tickers: ['AAPL', 'MSFT', 'GOOG'],
    startDate: '2020-01-01',
    endDate: '2024-12-31',
  };
}

describe('pcaAnalyzeSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => pcaAnalyzeSchema.parse(makeValidInput())).not.toThrow();
  });

  it.each([
    ['只有 1 个 ticker（min(2) 约束）', (d: Record<string, unknown>) => { d.tickers = ['AAPL']; }],
    ['tickers 为空数组', (d: Record<string, unknown>) => { d.tickers = []; }],
    ['缺少 tickers', (d: Record<string, unknown>) => { delete d.tickers; }],
    ['缺少 startDate', (d: Record<string, unknown>) => { delete d.startDate; }],
    ['startDate 为空字符串', (d: Record<string, unknown>) => { d.startDate = ''; }],
    ['缺少 endDate', (d: Record<string, unknown>) => { delete d.endDate; }],
    ['endDate 为空字符串', (d: Record<string, unknown>) => { d.endDate = ''; }],
    ['numComponents 为 0', (d: Record<string, unknown>) => { d.numComponents = 0; }],
    ['numComponents 为负数', (d: Record<string, unknown>) => { d.numComponents = -1; }],
    ['numComponents 为小数（int 约束）', (d: Record<string, unknown>) => { d.numComponents = 1.5; }],
    ['startDate 类型错误（数字）', (d: Record<string, unknown>) => { d.startDate = 20200101; }],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it.each([
    ['恰好 2 个 tickers（边界值）', (d: Record<string, unknown>) => { d.tickers = ['AAPL', 'MSFT']; }],
    ['numComponents 合法正整数', (d: Record<string, unknown>) => { d.numComponents = 2; }],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => pcaAnalyzeSchema.parse(data)).not.toThrow();
  });

  // 注：当前 schema 未对单个 ticker 做 min(1) 约束，仅约束数组长度
  it('tickers 含空字符串应通过校验（min(2) 仅约束长度）', () => {
    const data = makeValidInput() as Record<string, unknown>;
    data.tickers = ['', ''];
    expect(() => pcaAnalyzeSchema.parse(data)).not.toThrow();
  });
});
