/**
 * @file 前端通用常量
 * @description 集中管理散落在各 hooks/pages 中的默认日期等硬编码字面量，便于统一维护
 */
import type { BaseCurrency } from '@backtest/shared';

/** 默认分析起始日期 */
export const DEFAULT_START_DATE = '2015-01-01';

/** 默认分析结束日期 */
export const DEFAULT_END_DATE = '2024-12-31';

/** 默认回测起始日期（更长历史区间） */
export const DEFAULT_BACKTEST_START_DATE = '2010-01-01';

/**
 * 回测请求中各页面共享的基础 parameters 字段
 *
 * 仅包含跨页面一致的字段；startDate/endDate/startingValue/adjustForInflation/baseCurrency
 * 等页面特定字段由调用方 spread 后追加或 override。
 */
export const BASE_BACKTEST_PARAMS = {
  rollingWindowMonths: 12,
  benchmarkTicker: '',
  extendedWithdrawalStats: false,
  cashflowLegs: [] as unknown[],
  oneTimeCashflows: [] as unknown[],
};

/** buildBacktestParameters 的可选覆盖项 */
export interface BuildBacktestParametersOptions {
  startingValue?: number;
  adjustForInflation?: boolean;
  baseCurrency?: BaseCurrency;
  rollingWindowMonths?: number;
  benchmarkTicker?: string;
  extendedWithdrawalStats?: boolean;
  cashflowLegs?: unknown[];
  oneTimeCashflows?: unknown[];
}

/** buildBacktestParameters 返回的 parameters 对象类型 */
export interface BacktestParameters {
  startDate: string;
  endDate: string;
  startingValue: number;
  adjustForInflation: boolean;
  rollingWindowMonths: number;
  benchmarkTicker: string;
  baseCurrency: BaseCurrency;
  extendedWithdrawalStats: boolean;
  cashflowLegs: unknown[];
  oneTimeCashflows: unknown[];
}

/**
 * 构建回测请求中的 parameters 对象（统一各页面调用样板）
 *
 * 默认值与 EfficientFrontierUtils 既有实现保持一致（startingValue=10000,
 * adjustForInflation=false, baseCurrency='usd', rollingWindowMonths=12 等）。
 * 调用方可通过 options 覆盖任意字段。
 *
 * @param startDate - 回测起始日期（YYYY-MM-DD）
 * @param endDate - 回测结束日期（YYYY-MM-DD）
 * @param options - 可选覆盖项；未传字段使用默认值
 * @returns 完整的回测 parameters 对象
 */
export function buildBacktestParameters(
  startDate: string,
  endDate: string,
  options?: BuildBacktestParametersOptions,
): BacktestParameters {
  const defaults: BacktestParameters = {
    startDate,
    endDate,
    startingValue: 10000,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: '',
    baseCurrency: 'usd',
    extendedWithdrawalStats: false,
    cashflowLegs: [],
    oneTimeCashflows: [],
  };
  return { ...defaults, ...options };
}
