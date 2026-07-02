/**
 * letf schema 单元测试
 *
 * 企业理由：LETF 滑点分析参数校验失败会导致杠杆计算错误，
 * 影响投资决策。测试覆盖：
 * - 合法输入通过校验
 * - 缺少必填字段抛错
 * - leverage 非正数抛错
 * - 字符串为空抛错
 */

import { describe, it, expect } from 'vitest';
import { letfAnalyzeSchema } from '../../../api/schemas/letf.js';

function makeValidInput() {
  return {
    letfTicker: 'TQQQ',
    benchmarkTicker: 'QQQ',
    leverage: 3,
    startDate: '2020-01-01',
    endDate: '2024-12-31',
  };
}

describe('letfAnalyzeSchema', () => {
  it('合法输入应通过校验', () => {
    expect(() => letfAnalyzeSchema.parse(makeValidInput())).not.toThrow();
  });

  it('缺少 letfTicker 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).letfTicker;
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('letfTicker 为空字符串应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).letfTicker = '';
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('缺少 benchmarkTicker 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).benchmarkTicker;
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('benchmarkTicker 为空字符串应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).benchmarkTicker = '';
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('缺少 leverage 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).leverage;
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('leverage 为 0 应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).leverage = 0;
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('leverage 为负数应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).leverage = -2;
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('leverage 为小数应通过校验（positive 约束）', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).leverage = 2.5;
    expect(() => letfAnalyzeSchema.parse(data)).not.toThrow();
  });

  it('leverage 类型错误（字符串）应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).leverage = '3';
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('缺少 startDate 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).startDate;
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('startDate 为空字符串应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).startDate = '';
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('缺少 endDate 应抛错', () => {
    const data = makeValidInput();
    delete (data as Record<string, unknown>).endDate;
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('endDate 为空字符串应抛错', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).endDate = '';
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it('leverage=1 应通过校验（无杠杆基准）', () => {
    const data = makeValidInput();
    (data as Record<string, unknown>).leverage = 1;
    expect(() => letfAnalyzeSchema.parse(data)).not.toThrow();
  });
});
