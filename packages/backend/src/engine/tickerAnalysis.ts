/**
 * 单个标的分析 — 从 backtestRunner.ts 拆分
 */

import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants.js';
import type { BacktestParameters } from '@backtest/shared/types.js';
import {
  calcDrawdownCurve,
  calcRollingReturns,
  calcAnnualReturns,
  calcMonthlyReturns,
} from './growthCurve.js';
import {
  calcCAGR,
  calcAnnualizedStdev,
  calcMaxDrawdown,
  calcBeta,
  calcSharpe,
  calcSortino,
  calcAvgDrawdown,
  calcUlcerIndex,
  calcCalmar,
  calcUPI,
  calcSkewness,
  calcExcessKurtosis,
  calcBestYear,
  calcWorstYear,
  calcTotalReturn,
  calcVaR,
  calcCVaR,
  calcBestMonth,
  calcWorstMonth,
} from './statistics.js';

export interface AnalyzeTickerOptions {
  ticker: string;
  tIdx: number;
  prices: number[];
  dailyReturns: number[];
  benchmarkReturns: number[];
  filteredDates: string[];
  params: BacktestParameters;
}

export function analyzeSingleTicker(opts: AnalyzeTickerOptions): {
  ticker: string;
  growthCurve: Array<{ date: string; value: number }>;
  drawdownCurve: Array<{ date: string; drawdown: number }>;
  dailyReturns: number[];
  annualReturns: Array<{ year: number; return: number }>;
  monthlyReturns: Array<{ year: number; month: number; return: number }>;
  rollingReturns: Array<{ date: string; return: number }>;
  statistics: Record<string, number>;
} {
  const { ticker, tIdx, prices, dailyReturns, benchmarkReturns, filteredDates, params } = opts;

  if (prices.length < 2) {
    return {
      ticker,
      growthCurve: [],
      drawdownCurve: [],
      dailyReturns: [],
      annualReturns: [],
      monthlyReturns: [],
      rollingReturns: [],
      statistics: {
        cagr: 0,
        stdev: 0,
        sharpe: 0,
        sortino: 0,
        maxDrawdown: 0,
        maxDrawdownDuration: 0,
        avgDrawdown: 0,
        ulcerIndex: 0,
        calmar: 0,
        ulcerPerformanceIndex: 0,
        beta: 0,
        skewness: 0,
        excessKurtosis: 0,
        bestYear: 0,
        worstYear: 0,
        avgYear: 0,
        totalReturn: 0,
        var5: 0,
        cvar5: 0,
        pctPositiveDays: 0,
        maxDailyReturn: 0,
        minDailyReturn: 0,
        maxMonthlyReturn: 0,
        minMonthlyReturn: 0,
      },
    };
  }

  const dates = filteredDates.slice(0, prices.length);
  if (dates.length !== prices.length) {
    const len = Math.min(prices.length, filteredDates.length);
    dates.length = len;
  }
  const basePrice = prices[0];
  const values = prices.map((p) => p / basePrice);
  const scaledValues = values.map((v) => v * params.startingValue);

  const growthCurve = dates.map((d, i) => ({ date: d, value: scaledValues[i] }));
  const drawdownCurve = calcDrawdownCurve(values, dates);
  const rollingReturns = calcRollingReturns(scaledValues, dates, params.rollingWindowMonths);
  const annualReturns = calcAnnualReturns(scaledValues, dates);
  const monthlyReturns = calcMonthlyReturns(scaledValues, dates);

  const years = prices.length / TRADING_DAYS_PER_YEAR;
  const cagr = calcCAGR(prices[0], prices[prices.length - 1], years);
  const stdev = calcAnnualizedStdev(dailyReturns);
  const { maxDrawdown, maxDrawdownDuration } = calcMaxDrawdown(prices);
  const annualReturnValues = annualReturns.map((a) => a.return);
  const monthlyReturnValues = monthlyReturns.map((m) => m.return);
  const beta =
    tIdx !== 0 && benchmarkReturns.length >= 2
      ? calcBeta(dailyReturns, benchmarkReturns)
      : tIdx === 0
        ? 1
        : 0;

  return {
    ticker,
    growthCurve,
    drawdownCurve,
    dailyReturns,
    annualReturns,
    monthlyReturns,
    rollingReturns,
    statistics: buildTickerStatistics({
      cagr,
      stdev,
      dailyReturns,
      prices,
      maxDrawdown,
      maxDrawdownDuration,
      annualReturnValues,
      monthlyReturnValues,
      beta,
    }),
  };
}

function buildTickerStatistics(args: {
  cagr: number;
  stdev: number;
  dailyReturns: number[];
  prices: number[];
  maxDrawdown: number;
  maxDrawdownDuration: number;
  annualReturnValues: number[];
  monthlyReturnValues: number[];
  beta: number;
}): Record<string, number> {
  const {
    cagr,
    stdev,
    dailyReturns,
    prices,
    maxDrawdown,
    maxDrawdownDuration,
    annualReturnValues,
    monthlyReturnValues,
    beta,
  } = args;
  const ulcerIndex = calcUlcerIndex(prices);
  return {
    cagr,
    stdev,
    sharpe: calcSharpe(cagr, stdev),
    sortino: calcSortino(cagr, dailyReturns),
    maxDrawdown,
    maxDrawdownDuration,
    avgDrawdown: calcAvgDrawdown(prices),
    ulcerIndex,
    calmar: calcCalmar(cagr, maxDrawdown),
    ulcerPerformanceIndex: calcUPI(cagr, ulcerIndex),
    beta,
    skewness: calcSkewness(dailyReturns),
    excessKurtosis: calcExcessKurtosis(dailyReturns),
    bestYear: calcBestYear(annualReturnValues),
    worstYear: calcWorstYear(annualReturnValues),
    avgYear:
      annualReturnValues.length > 0
        ? annualReturnValues.reduce((s, r) => s + r, 0) / annualReturnValues.length
        : 0,
    totalReturn: calcTotalReturn(prices[0], prices[prices.length - 1]),
    var5: calcVaR(dailyReturns, 0.95),
    cvar5: calcCVaR(dailyReturns, 0.95),
    pctPositiveDays:
      dailyReturns.length > 0 ? dailyReturns.filter((r) => r > 0).length / dailyReturns.length : 0,
    maxDailyReturn: dailyReturns.length > 0 ? Math.max(...dailyReturns) : 0,
    minDailyReturn: dailyReturns.length > 0 ? Math.min(...dailyReturns) : 0,
    maxMonthlyReturn: calcBestMonth(monthlyReturnValues),
    minMonthlyReturn: calcWorstMonth(monthlyReturnValues),
  };
}
