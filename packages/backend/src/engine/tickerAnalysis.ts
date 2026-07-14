/**
 * 单个标的分析 — 从 backtestRunner.ts 拆分。
 * tactical 专用，与 Go engine 概念重叠但合规保留（ADR-008）。
 */

import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants.js';
import type { BacktestParameters, Statistics } from '@backtest/shared';
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

function emptyTickerResult(ticker: string, statistics?: Partial<Statistics>) {
  return {
    ticker,
    growthCurve: [] as Array<{ date: string; value: number }>,
    drawdownCurve: [] as Array<{ date: string; drawdown: number }>,
    dailyReturns: [] as number[],
    annualReturns: [] as Array<{ year: number; return: number }>,
    monthlyReturns: [] as Array<{ year: number; month: number; return: number }>,
    rollingReturns: [] as Array<{ date: string; return: number }>,
    statistics: statistics ?? {},
  };
}

function computeStandardTickerStats(opts: {
  prices: number[];
  dailyReturns: number[];
  annualReturnValues: number[];
  monthlyReturnValues: number[];
  tIdx: number;
  benchmarkReturns: number[];
}) {
  const { prices, dailyReturns, tIdx, benchmarkReturns } = opts;
  const years = prices.length / TRADING_DAYS_PER_YEAR;
  const cagr = calcCAGR(prices[0], prices[prices.length - 1], years);
  const stdev = calcAnnualizedStdev(dailyReturns);
  const { maxDrawdown, maxDrawdownDuration } = calcMaxDrawdown(prices);
  const beta =
    tIdx !== 0 && benchmarkReturns.length >= 2
      ? calcBeta(dailyReturns, benchmarkReturns)
      : tIdx === 0
        ? 1
        : 0;
  return { cagr, stdev, maxDrawdown, maxDrawdownDuration, beta };
}

function computeTickerCurves(
  prices: number[],
  filteredDates: string[],
  params: BacktestParameters,
) {
  const dates = filteredDates.slice(0, prices.length);
  if (dates.length !== prices.length) {
    dates.length = Math.min(prices.length, filteredDates.length);
  }
  const basePrice = prices[0];
  const values = prices.map((p) => p / basePrice);
  const scaledValues = values.map((v) => v * params.startingValue);
  return {
    growthCurve: dates.map((d, i) => ({ date: d, value: scaledValues[i] })),
    drawdownCurve: calcDrawdownCurve(values, dates),
    rollingReturns: calcRollingReturns(scaledValues, dates, params.rollingWindowMonths),
    annualReturns: calcAnnualReturns(scaledValues, dates),
    monthlyReturns: calcMonthlyReturns(scaledValues, dates),
  };
}

export function analyzeSingleTicker(
  opts: AnalyzeTickerOptions,
): ReturnType<typeof emptyTickerResult> {
  const { ticker, tIdx, prices, dailyReturns, benchmarkReturns, filteredDates, params } = opts;

  if (prices.length < 2) {
    return emptyTickerResult(ticker, {
      cagr: 0,
      mwrr: 0,
      stdev: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      maxDrawdownDuration: 0,
      bestYear: 0,
      worstYear: 0,
      avgYear: 0,
      totalReturn: 0,
      maxMonthlyReturn: 0,
      minMonthlyReturn: 0,
      avgDrawdown: 0,
      ulcerIndex: 0,
      calmar: 0,
      ulcerPerformanceIndex: 0,
      beta: 0,
      alpha: 0,
      rSquared: 0,
      trackingError: 0,
      informationRatio: 0,
      upsideCapture: 0,
      downsideCapture: 0,
      var: {
        daily: { 1: 0, 5: 0, 10: 0 },
        monthly: { 1: 0, 5: 0, 10: 0 },
        annual: { 1: 0, 5: 0, 10: 0 },
      },
      cvar: {
        daily: { 1: 0, 5: 0, 10: 0 },
        monthly: { 1: 0, 5: 0, 10: 0 },
        annual: { 1: 0, 5: 0, 10: 0 },
      },
      skewness: { daily: 0, monthly: 0, annual: 0 },
      excessKurtosis: { daily: 0, monthly: 0, annual: 0 },
      winRate: { daily: 0, monthly: 0, annual: 0 },
      maxDailyReturn: 0,
      minDailyReturn: 0,
    });
  }

  const { growthCurve, drawdownCurve, rollingReturns, annualReturns, monthlyReturns } =
    computeTickerCurves(prices, filteredDates, params);
  const annualReturnValues = annualReturns.map((a) => a.return);
  const monthlyReturnValues = monthlyReturns.map((m) => m.return);
  const { cagr, stdev, maxDrawdown, maxDrawdownDuration, beta } = computeStandardTickerStats({
    prices,
    dailyReturns,
    annualReturnValues,
    monthlyReturnValues,
    tIdx,
    benchmarkReturns,
  });

  return {
    ...emptyTickerResult(ticker),
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
}): Partial<Statistics> {
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
    skewness: { daily: calcSkewness(dailyReturns), monthly: 0, annual: 0 },
    excessKurtosis: { daily: calcExcessKurtosis(dailyReturns), monthly: 0, annual: 0 },
    bestYear: calcBestYear(annualReturnValues),
    worstYear: calcWorstYear(annualReturnValues),
    avgYear:
      annualReturnValues.length > 0
        ? annualReturnValues.reduce((s, r) => s + r, 0) / annualReturnValues.length
        : 0,
    totalReturn: calcTotalReturn(prices[0], prices[prices.length - 1]),
    var: {
      daily: { 1: 0, 5: 0, 10: 0 },
      monthly: { 1: 0, 5: 0, 10: 0 },
      annual: { 1: 0, 5: calcVaR(dailyReturns, 0.95), 10: 0 },
    },
    cvar: {
      daily: { 1: 0, 5: 0, 10: 0 },
      monthly: { 1: 0, 5: 0, 10: 0 },
      annual: { 1: 0, 5: calcCVaR(dailyReturns, 0.95), 10: 0 },
    },
    winRate: {
      daily:
        dailyReturns.length > 0
          ? dailyReturns.filter((r) => r > 0).length / dailyReturns.length
          : 0,
      monthly: 0,
      annual: 0,
    },
    maxDailyReturn: dailyReturns.length > 0 ? Math.max(...dailyReturns) : 0,
    minDailyReturn: dailyReturns.length > 0 ? Math.min(...dailyReturns) : 0,
    maxMonthlyReturn: calcBestMonth(monthlyReturnValues),
    minMonthlyReturn: calcWorstMonth(monthlyReturnValues),
  };
}
