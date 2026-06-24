// 回测参数与结果类型定义

import type { BaseCurrency, CashflowLeg, OneTimeCashflow } from './portfolio.js';
import type { Statistics, WithdrawalStats } from './statistics.js';

/** 回测参数 */
export interface BacktestParameters {
  startDate: string;
  endDate: string;
  startingValue: number;
  /** 基础货币，决定通胀CPI和货币符号 */
  baseCurrency?: BaseCurrency;
  adjustForInflation: boolean;
  rollingWindowMonths: number;
  benchmarkTicker: string;
  /** 是否计算扩展回撤统计 */
  extendedWithdrawalStats?: boolean;
  /** 周期性现金流腿（从 portfolio.ts 导入类型） */
  cashflowLegs?: CashflowLeg[];
  /** 一次性现金流 */
  oneTimeCashflows?: OneTimeCashflow[];
}

/** 回撤事件 */
export interface DrawdownEpisode {
  peakDate: string;
  troughDate: string;
  recoveryDate?: string;
  depth: number;
  timeToTrough: number;
  recoveryTime: number;
  totalTime: number;
  recoveryFactor: number;
  cagrDuring: number;
  ulcerDuring: number;
  returnFromPeakToTrough: number;
  returnFromTroughToRecovery?: number;
}

/** Drag（拖累）计算结果 */
export interface DragResult {
  /** 累积 drag 金额 */
  totalDrag: number;
  /** 年化 drag 比率（小数形式） */
  annualDrag: number;
  /** 每个时间点的累积 drag 序列 */
  dragSeries: number[];
}

/** 单个组合的回测结果 */
export interface PortfolioResult {
  name: string;
  growthCurve: Array<{ date: string; value: number }>;
  drawdownCurve: Array<{ date: string; drawdown: number }>;
  rollingReturns: Array<{ date: string; return: number }>;
  annualReturns: Array<{ year: number; return: number }>;
  monthlyReturns: Array<{ year: number; month: number; return: number }>;
  statistics: Statistics;
  withdrawalStats?: WithdrawalStats;
  drawdownEpisodes?: DrawdownEpisode[];
  allocationHistory?: Array<{ date: string; weights: number[] }>;
  /** Drag（拖累）近似计算结果，仅在降级模式且组合配置了 drag 时存在 */
  drag?: DragResult;
}

/** 完整回测结果 */
export interface BacktestResult {
  portfolios: PortfolioResult[];
  correlations: number[][];
  benchmarkGrowth?: Array<{ date: string; value: number }>;
  assetTickers?: string[];
  assetCorrelations?: number[][];
}

/** 资产分析结果 */
export interface AssetAnalysisResult {
  tickers: Array<{
    ticker: string;
    growthCurve: Array<{ date: string; value: number }>;
    drawdownCurve: Array<{ date: string; drawdown: number }>;
    dailyReturns: number[];
    annualReturns: Array<{ year: number; return: number }>;
    monthlyReturns: Array<{ year: number; month: number; return: number }>;
    rollingReturns: Array<{ date: string; return: number }>;
    statistics: Partial<Statistics>;
  }>;
  correlations: number[][];
}
