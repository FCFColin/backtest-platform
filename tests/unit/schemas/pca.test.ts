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

  it('恰好 2 个 tickers 应通过校验（边界值）', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).tickers = ['AAPL', 'MSFT'];
    expect(() => pcaAnalyzeSchema.parse(data)).not.toThrow();
  });

  it('只有 1 个 ticker 应抛错（min(2) 约束）', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).tickers = ['AAPL'];
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it('tickers 为空数组应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).tickers = [];
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it('缺少 tickers 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).tickers;
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it('tickers 含空字符串应通过校验（min(2) 仅约束长度）', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).tickers = ['', ''];
    // 注：当前 schema 未对单个 ticker 做 min(1) 约束
    expect(() => pcaAnalyzeSchema.parse(data)).not.toThrow();
  });

  it('缺少 startDate 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).startDate;
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it('startDate 为空字符串应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).startDate = '';
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it('缺少 endDate 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).endDate;
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it('endDate 为空字符串应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).endDate = '';
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it('numComponents 合法正整数应通过', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).numComponents = 2;
    expect(() => pcaAnalyzeSchema.parse(data)).not.toThrow();
  });

  it('numComponents 为 0 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).numComponents = 0;
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it('numComponents 为负数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).numComponents = -1;
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it('numComponents 为小数应抛错（int 约束）', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).numComponents = 1.5;
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });

  it('startDate 类型错误（数字）应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).startDate = 20200101;
    expect(() => pcaAnalyzeSchema.parse(data)).toThrow();
  });
});
