import type { BaseCurrency, CashflowLeg, OneTimeCashflow } from './portfolio.js';
import type { Statistics } from './statistics.js';

export interface PriceData {
  [ticker: string]: Record<string, number>;
}

/** 回测参数（adjustForInflation 启用 CPI 调整；rollingWindowMonths 控制滚动收益窗口；extendedWithdrawalStats 启用 SWR/PWR 计算） */
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
