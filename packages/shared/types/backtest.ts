/**
 * 回测参数与结果类型定义
 *
 * 定义回测请求的输入参数和各个阶段的输出结果结构。
 * PortfolioResult 是回测核心输出的统一格式。
 */

import type { BaseCurrency, CashflowLeg, OneTimeCashflow } from './portfolio.js';
import type { Statistics, WithdrawalStats } from './statistics.js';

/**
 * 回测参数
 *
 * adjustForInflation：启用后使用 baseCurrency 对应的 CPI 数据将净值调整为实际购买力。
 * baseCurrency 为 'cny' 时使用中国 CPI，'usd' 时使用美国 CPI。
 *
 * rollingWindowMonths：滚动收益计算的时间窗口（月数），影响 rollingReturns 序列。
 * 典型值 12（年化滚动收益）、36（三年滚动）、60（五年滚动）。
 *
 * extendedWithdrawalStats：启用后计算 SWR/PWR 等提款统计，需要额外的模拟计算。
 * 仅在需要提款分析时开启以节省计算资源。
 */
export interface BacktestParameters {
  startDate: string;
  endDate: string;
  startingValue: number;
  baseCurrency?: BaseCurrency;
  adjustForInflation: boolean;
  rollingWindowMonths: number;
  benchmarkTicker: string;
  extendedWithdrawalStats?: boolean;
  cashflowLegs?: CashflowLeg[];
  oneTimeCashflows?: OneTimeCashflow[];
}

/**
 * 回撤事件
 *
 * 记录从峰值到谷值再到恢复的完整回撤周期。
 * recoveryDate 为空时表示回测结束时该回撤尚未恢复。
 * timeToTrough/recoveryTime/totalTime 均以交易日为单位。
 * cagrDuring 表示回撤期间的复合年化收益率（通常为负值）。
 * ulcerDuring 表示回撤期间的 ulcer 指数。
 */
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

/**
 * Drag（拖累）计算结果
 *
 * 模拟管理费、交易成本等持续损耗对组合净值的累积影响。
 * dragSeries 与 growthCurve 一一对应，表示到该时间点为止累积扣除的金额。
 * 仅在组合配置了 drag 且引擎处于降级模式时生成（Go/Rust 引擎在引擎内部计算 drag）。
 */
export interface DragResult {
  totalDrag: number;
  annualDrag: number;
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
