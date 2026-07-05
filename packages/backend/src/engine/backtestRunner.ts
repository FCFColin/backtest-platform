/**
 * 组合回测核心逻辑 — 回测执行器
 * 从 portfolio.ts 拆分而出
 */

import type {
  Portfolio,
  BacktestParameters,
  PortfolioResult,
  BacktestResult,
  AssetAnalysisResult,
} from '@backtest/shared/types.js';
import {
  calcDailyReturns,
  calcCAGR,
  calcCorrelation,
  calcAnnualizedStdev,
  calcMaxDrawdown,
  calcBeta,
  calculatePortfolioStatistics,
  buildTickerStatistics,
} from './statistics.js';
import { filterDates } from '../utils/dateUtils.js';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants.js';
import {
  getSortedDates,
  getPrice,
  getPriceWithFx,
  type DateValueMap,
  buildGrowthCurve,
  applyInflationAdjustment,
  calcDrawdownCurve,
  calcRollingReturns,
  calcAnnualReturns,
  calcMonthlyReturns,
  createEmptyPortfolioResult,
} from './growthCurve.js';

/** 价格数据格式：{ [ticker]: { [date: string]: number } } */
export interface PriceData {
  [ticker: string]: Record<string, number>;
}

export interface BacktestHooks {
  onRebalance?: (info: {
    portfolioId: string;
    portfolioName: string;
    date: string;
    reason: string;
    currentWeights: Record<string, number>;
  }) => void;
}

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

function calcCorrelationMatrix(portfolioResults: PortfolioResult[]): number[][] {
  const n = portfolioResults.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else if (j < i) {
        matrix[i][j] = matrix[j][i];
      } else {
        const returns1 = calcDailyReturns(portfolioResults[i].growthCurve.map((g) => g.value));
        const returns2 = calcDailyReturns(portfolioResults[j].growthCurve.map((g) => g.value));
        matrix[i][j] = calcCorrelation(returns1, returns2);
      }
    }
  }

  return matrix;
}

interface AnalyzeTickerOptions {
  ticker: string;
  tIdx: number;
  prices: number[];
  dailyReturns: number[];
  benchmarkReturns: number[];
  filteredDates: string[];
  params: BacktestParameters;
}

function analyzeSingleTicker(opts: AnalyzeTickerOptions): {
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
      statistics: { cagr: 0, stdev: 0, sharpe: 0, maxDrawdown: 0 },
    };
  }

  const dates = filteredDates.slice(0, prices.length);
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

export function calculateDrag(
  portfolioValue: number[],
  _cashflows: Array<{ date: string; amount: number }>,
  _rebalanceFrequency: string,
  dragPct: number = 0.001,
): {
  totalDrag: number;
  annualDrag: number;
  dragSeries: number[];
} {
  if (portfolioValue.length === 0) {
    return { totalDrag: 0, annualDrag: 0, dragSeries: [] };
  }

  const dragSeries: number[] = [];
  let cumulativeDrag = 0;

  for (let i = 0; i < portfolioValue.length; i++) {
    const prevValue = i > 0 ? portfolioValue[i - 1] : portfolioValue[0];
    const periodDrag = (prevValue * dragPct) / TRADING_DAYS_PER_YEAR;
    cumulativeDrag += periodDrag;
    dragSeries.push(cumulativeDrag);
  }

  const years = portfolioValue.length / TRADING_DAYS_PER_YEAR;
  const finalValue = portfolioValue[portfolioValue.length - 1];
  const annualDrag = years > 0 && finalValue !== 0 ? cumulativeDrag / years / finalValue : 0;

  return {
    totalDrag: cumulativeDrag,
    annualDrag,
    dragSeries,
  };
}
