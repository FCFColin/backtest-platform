/**
 * 组合回测核心逻辑 — 统一导出入口
 * 从 growthCurve.ts、statistics.ts 和 backtestRunner.ts 重新导出
 */

export type { PriceData, BacktestHooks } from './backtestRunner.js';
export { runPortfolioBacktest, runAnalysis, calculateDrag } from './backtestRunner.js';

export type { DateValueMap } from './growthCurve.js';
export {
  getSortedDates,
  getPrice,
  getPriceWithFx,
  buildGrowthCurve,
  applyInflationAdjustment,
  calcDrawdownCurve,
  calcRollingReturns,
  calcAnnualReturns,
  calcMonthlyReturns,
  createEmptyPortfolioResult,
} from './growthCurve.js';

export {
  calcDailyReturns,
  calcCAGR,
  calcCorrelation,
  calcAnnualizedStdev,
  calcMaxDrawdown,
  calcBeta,
  calculatePortfolioStatistics,
  buildTickerStatistics,
} from './statistics.js';
