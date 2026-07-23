/**
 * letf schema 单元测试
 *
 * 企业理由：LETF 滑点分析参数校验失败会导致杠杆计算错误，
 * 影响投资决策。测试覆盖：
 * - 合法输入通过校验
 * - 缺少必填字段抛 ZodError
 * - leverage 非正数抛错
 * - 字符串为空抛错
 */

import { describe, it, expect } from 'vitest';
import { letfAnalyzeSchema } from '../../../packages/backend/src/schemas/letf.js';

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

  it.each([
    ['缺少 letfTicker', (d: Record<string, unknown>) => { delete d.letfTicker; }],
    ['letfTicker 为空字符串', (d: Record<string, unknown>) => { d.letfTicker = ''; }],
    ['缺少 benchmarkTicker', (d: Record<string, unknown>) => { delete d.benchmarkTicker; }],
    ['benchmarkTicker 为空字符串', (d: Record<string, unknown>) => { d.benchmarkTicker = ''; }],
    ['缺少 leverage', (d: Record<string, unknown>) => { delete d.leverage; }],
    ['leverage 为 0', (d: Record<string, unknown>) => { d.leverage = 0; }],
    ['leverage 为负数', (d: Record<string, unknown>) => { d.leverage = -2; }],
    ['leverage 类型错误（字符串）', (d: Record<string, unknown>) => { d.leverage = '3'; }],
    ['缺少 startDate', (d: Record<string, unknown>) => { delete d.startDate; }],
    ['startDate 为空字符串', (d: Record<string, unknown>) => { d.startDate = ''; }],
    ['缺少 endDate', (d: Record<string, unknown>) => { delete d.endDate; }],
    ['endDate 为空字符串', (d: Record<string, unknown>) => { d.endDate = ''; }],
  ])('%s 应抛错', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => letfAnalyzeSchema.parse(data)).toThrow();
  });

  it.each([
    ['leverage 为小数（positive 约束）', (d: Record<string, unknown>) => { d.leverage = 2.5; }],
    ['leverage=1（无杠杆基准）', (d: Record<string, unknown>) => { d.leverage = 1; }],
  ])('%s 应通过校验', (_name, mutate) => {
    const data = makeValidInput() as Record<string, unknown>;
    mutate(data);
    expect(() => letfAnalyzeSchema.parse(data)).not.toThrow();
  });
});
