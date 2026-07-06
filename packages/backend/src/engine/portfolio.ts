/**
 * 组合回测核心逻辑 — 统一导出入口
 * 从 backtestRunner.ts 和 statistics.ts 重新导出
 */

export type { PriceData, BacktestHooks, DateValueMap } from './growthCurve.js';
export { runPortfolioBacktest, runAnalysis, calculateDrag } from './backtestRunner.js';

export {
  calcCAGR,
  calcMWRR,
  calcAnnualizedStdev,
  calcSharpe,
  calcSortino,
  calcMaxDrawdown,
  calcCorrelation,
  calcDailyReturns,
  calcTotalReturn,
  calcBestYear,
  calcWorstYear,
  calcBestMonth,
  calcWorstMonth,
  calcAvgDrawdown,
  calcUlcerIndex,
  calcCalmar,
  calcUPI,
  calcBeta,
  calcAlpha,
  calcRSquared,
  calcTrackingError,
  calcInformationRatio,
  calcUpsideCapture,
  calcDownsideCapture,
  calcVaR,
  calcCVaR,
  calcSkewness,
  calcExcessKurtosis,
  calcPWR,
} from './statistics.js';
