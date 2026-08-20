import type { BaseCurrency, CashflowLeg, OneTimeCashflow } from './portfolio.js';
import type { Statistics } from './statistics.js';

export interface PriceData {
  [ticker: string]: Record<string, number>;
}

/** 回测参数（adjustForInflation 启用 CPI 调整；rollingWindowMonths 控制滚动收益窗口） */
export interface BacktestParameters {
  startDate: string;
  endDate: string;
  startingValue: number;
  baseCurrency?: BaseCurrency;
  adjustForInflation: boolean;
  rollingWindowMonths: number;
  benchmarkTicker: string;
  cashflowLegs?: CashflowLeg[];
  oneTimeCashflows?: OneTimeCashflow[];
}

export type TimeSeriesPoint = { date: string; value: number };

export type DrawdownPoint = { date: string; drawdown: number };

export type RollingReturn = { date: string; return: number };
export type AnnualReturn = { year: number; return: number };
export type MonthlyReturn = { year: number; month: number; return: number };
export type AllocationPoint = { date: string; weights: number[] };

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

export interface PortfolioResult {
  name: string;
  growthCurve: TimeSeriesPoint[];
  drawdownCurve: DrawdownPoint[];
  rollingReturns: RollingReturn[];
  annualReturns: AnnualReturn[];
  monthlyReturns: MonthlyReturn[];
  statistics: Statistics;
  drawdownEpisodes?: DrawdownEpisode[];
  allocationHistory?: AllocationPoint[];
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
    annualReturns: AnnualReturn[];
    monthlyReturns: MonthlyReturn[];
    rollingReturns: RollingReturn[];
    statistics: Partial<Statistics>;
  }>;
  correlations: number[][];
}
