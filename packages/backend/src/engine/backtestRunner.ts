/**
 * 组合回测核心逻辑 — 回测执行器
 * 从 portfolio.ts 拆分而出，包含回测执行、增长曲线构建、曲线计算等
 */

import type {
  Portfolio,
  BacktestParameters,
  PortfolioResult,
  BacktestResult,
  AssetAnalysisResult,
} from '@backtest/shared/types.js';
import {
  calcCAGR,
  calcDailyReturns,
  calcCorrelation,
  calculatePortfolioStatistics,
} from './statistics.js';
import { filterDates } from '../utils/dateUtils.js';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants.js';
import {
  type PriceData,
  type DateValueMap,
  type BacktestHooks,
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
import { analyzeSingleTicker } from './tickerAnalysis.js';
import { calcCorrelationMatrix } from './correlation.js';
export type { PriceData, DateValueMap, BacktestHooks };

interface RunSinglePortfolioOptions {
  portfolio: Portfolio;
  priceData: PriceData;
  dates: string[];
  params: BacktestParameters;
  benchmarkDailyReturns?: number[];
  benchmarkCagr?: number;
  cpiData?: DateValueMap;
  exchangeRates?: DateValueMap;
  hooks?: BacktestHooks;
}

function runSinglePortfolio(opts: RunSinglePortfolioOptions): PortfolioResult {
  const {
    portfolio,
    priceData,
    dates,
    params,
    benchmarkDailyReturns,
    benchmarkCagr,
    cpiData,
    exchangeRates,
    hooks,
  } = opts;
  const { startingValue } = params;

  if (portfolio.assets.length === 0) {
    return createEmptyPortfolioResult(portfolio.name);
  }

  const { growthCurve, values, mwrrCashflows } = buildGrowthCurve({
    portfolio,
    priceData,
    dates,
    params,
    exchangeRates,
    hooks,
  });

  if (params.adjustForInflation) {
    applyInflationAdjustment(values, growthCurve, dates, cpiData);
  }

  const drawdownCurve = calcDrawdownCurve(values, dates);
  const rollingReturns = calcRollingReturns(values, dates, params.rollingWindowMonths);
  const annualReturns = calcAnnualReturns(values, dates);
  const monthlyReturns = calcMonthlyReturns(values, dates);

  const dailyReturns = calcDailyReturns(values);
  const statistics = calculatePortfolioStatistics({
    values,
    dates,
    startingValue,
    dailyReturns,
    annualReturns,
    monthlyReturns,
    mwrrCashflows,
    benchmarkDailyReturns,
    benchmarkCagr,
  });

  return {
    name: portfolio.name,
    growthCurve,
    drawdownCurve,
    rollingReturns,
    annualReturns,
    monthlyReturns,
    statistics,
  };
}

interface BacktestOptions {
  cpiData?: DateValueMap;
  exchangeRates?: DateValueMap;
  hooks?: BacktestHooks;
}

export function runPortfolioBacktest(
  portfolios: Portfolio[],
  priceData: PriceData,
  params: BacktestParameters,
  options?: BacktestOptions,
): BacktestResult {
  const { cpiData, exchangeRates, hooks } = options ?? {};
  const dates = getSortedDates(priceData);

  const filteredDates = filterDates(dates, params.startDate, params.endDate);

  let benchmarkDailyReturns: number[] | undefined;
  let benchmarkCagr: number | undefined;
  let benchmarkGrowth: Array<{ date: string; value: number }> | undefined;

  if (params.benchmarkTicker && priceData[params.benchmarkTicker]) {
    const benchmarkPrices = filteredDates
      .map((d) => ({
        date: d,
        price: getPriceWithFx(priceData, params.benchmarkTicker!, d, exchangeRates),
      }))
      .filter((p) => p.price !== null);

    if (benchmarkPrices.length > 1) {
      const priceValues = benchmarkPrices.map((p) => p.price!);
      const basePrice = priceValues[0];
      benchmarkDailyReturns = calcDailyReturns(priceValues);
      const benchmarkYears = priceValues.length / TRADING_DAYS_PER_YEAR;
      benchmarkCagr = calcCAGR(basePrice, priceValues[priceValues.length - 1], benchmarkYears);
      benchmarkGrowth = benchmarkPrices.map((p) => ({
        date: p.date,
        value: (p.price! / basePrice) * params.startingValue,
      }));
    }
  }

  const portfolioResults: PortfolioResult[] = portfolios.map((p) =>
    runSinglePortfolio({
      portfolio: p,
      priceData,
      dates: filteredDates,
      params,
      benchmarkDailyReturns,
      benchmarkCagr,
      cpiData,
      exchangeRates,
      hooks,
    }),
  );

  const correlations = calcCorrelationMatrix(portfolioResults);

  return {
    portfolios: portfolioResults,
    correlations,
    benchmarkGrowth,
  };
}

export function runAnalysis(
  tickers: string[],
  priceData: PriceData,
  params: BacktestParameters,
): AssetAnalysisResult {
  const dates = getSortedDates(priceData);
  const filteredDates = filterDates(dates, params.startDate, params.endDate);

  const allPrices = tickers.map((ticker) =>
    filteredDates.map((d) => getPrice(priceData, ticker, d)).filter((p): p is number => p !== null),
  );
  const allReturns = allPrices.map((prices) => calcDailyReturns(prices));

  const results = tickers.map((ticker, tIdx) =>
    analyzeSingleTicker({
      ticker,
      tIdx,
      prices: allPrices[tIdx],
      dailyReturns: allReturns[tIdx],
      benchmarkReturns: allReturns[0] ?? [],
      filteredDates,
      params,
    }),
  );

  const n = tickers.length;
  const correlations: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        correlations[i][j] = 1;
      } else if (j < i) {
        correlations[i][j] = correlations[j][i];
      } else {
        correlations[i][j] = calcCorrelation(allReturns[i], allReturns[j]);
      }
    }
  }

  return { tickers: results, correlations };
}

export { calculateDrag } from './drag.js';
