/**
 * @file 前端通用常量
 * @description 集中管理散落在各 hooks/pages 中的默认日期等硬编码字面量，便于统一维护
 */

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
