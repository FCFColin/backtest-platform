import type { BaseCurrency, CashflowLeg, OneTimeCashflow } from './portfolio.js';
import type { Statistics } from './statistics.js';

export interface PriceData {
  [ticker: string]: Record<string, number>;
}

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

export type TimeSeriesPoint = { date: string; value: number };

type DrawdownPoint = { date: string; drawdown: number };

export interface DrawdownEpisode {
  peakDate: string;
  troughDate: string;
  recoveryDate?: string;
  depth: number;
  timeToTrough: number;
  recoveryTime: number;
  totalTimeDurationDays: number;
  recoveryFactor: number;
  cagrDuring: number;
  ulcerDuring: number;
  returnFromPeakToTrough: number;
  returnFromTroughToRecovery?: number;
}

interface DragResult {
  totalDrag: number;
  annualDrag: number;
  dragSeries: number[];
}

export interface PortfolioResult {
  name: string;
  growthCurve: TimeSeriesPoint[];
  drawdownCurve: DrawdownPoint[];
  rollingReturns: Array<{ date: string; return: number }>;
  annualReturns: Array<{ year: number; return: number }>;
  monthlyReturns: Array<{ year: number; month: number; return: number }>;
  statistics: Statistics;
  drawdownEpisodes?: DrawdownEpisode[];
  allocationHistory?: Array<{ date: string; weights: number[] }>;
  drag?: DragResult;
}

export interface BacktestResult {
  portfolios: PortfolioResult[];
  correlations: number[][];
  benchmarkGrowth?: TimeSeriesPoint[];
  assetTickers?: string[];
  assetCorrelations?: number[][];
}

export interface AssetAnalysisResult {
  tickers: Array<{
    ticker: string;
    growthCurve: TimeSeriesPoint[];
    drawdownCurve: DrawdownPoint[];
    dailyReturns: number[];
    annualReturns: Array<{ year: number; return: number }>;
    monthlyReturns: Array<{ year: number; month: number; return: number }>;
    rollingReturns: Array<{ date: string; return: number }>;
    statistics: Partial<Statistics>;
  }>;
  correlations: number[][];
}
