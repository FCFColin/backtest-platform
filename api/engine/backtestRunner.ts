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
  Statistics,
} from '../../shared/types.js';
import {
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
import { filterDates } from '../utils/dateUtils.js';
import { shouldRebalance, getISOWeekNumber } from './rebalance.js';
import { TRADING_DAYS_PER_YEAR } from '../../shared/constants.js';

/** 价格数据格式：{ [ticker]: { [date: string]: number } } */
export interface PriceData {
  [ticker: string]: Record<string, number>;
}

/** getSortedDates 缓存 */
const sortedDatesCache = new WeakMap<PriceData, string[]>();

/** 获取所有交易日期（排序后的日期数组，带缓存） */
function getSortedDates(priceData: PriceData): string[] {
  const cached = sortedDatesCache.get(priceData);
  if (cached) return cached;

  const dateSet = new Set<string>();
  for (const ticker of Object.keys(priceData)) {
    for (const date of Object.keys(priceData[ticker])) {
      dateSet.add(date);
    }
  }
  const result = Array.from(dateSet).sort();
  sortedDatesCache.set(priceData, result);
  return result;
}

/** 获取某资产在某日的价格，找不到返回 null */
function getPrice(priceData: PriceData, ticker: string, date: string): number | null {
  return priceData[ticker]?.[date] ?? null;
}

/** CPI/汇率数据格式：{ [date: string]: number } */
export type DateValueMap = Record<string, number>;

function findCpiForDate(date: string, cpiData: DateValueMap): number {
  if (date.length < 10) return 0;
  if (cpiData[date] !== undefined) return cpiData[date];
  const monthStart = date.substring(0, 8) + '01';
  if (cpiData[monthStart] !== undefined) return cpiData[monthStart];
  const d = new Date(date);
  for (let i = 0; i < 10; i++) {
    d.setDate(d.getDate() - 1);
    const key = d.toISOString().substring(0, 10);
    if (cpiData[key] !== undefined) return cpiData[key];
  }
  return 0;
}

function getPriceWithFx(
  priceData: PriceData,
  ticker: string,
  date: string,
  exchangeRates?: DateValueMap,
): number | null {
  const raw = getPrice(priceData, ticker, date);
  if (raw === null) return null;
  if (!exchangeRates || Object.keys(exchangeRates).length === 0) return raw;
  if (raw <= 0) return raw;
  if (exchangeRates[date] !== undefined) return raw * exchangeRates[date];
  const d = new Date(date);
  for (let i = 0; i < 10; i++) {
    d.setDate(d.getDate() - 1);
    const key = d.toISOString().substring(0, 10);
    if (exchangeRates[key] !== undefined) return raw * exchangeRates[key];
  }
  return raw;
}

interface CashflowCheckOptions {
  frequency: string;
  currentDate: string;
  prevDate: string | null;
  startDate: string;
  offset: number;
  until?: string;
}

function shouldApplyCashflow(opts: CashflowCheckOptions): boolean {
  const { frequency, currentDate, prevDate, startDate, offset, until } = opts;
  if (until && currentDate > until) return false;
  const cur = new Date(currentDate);
  const start = new Date(startDate);
  const daysSinceStart = Math.floor((cur.getTime() - start.getTime()) / 86400000);
  if (daysSinceStart < offset) return false;
  if (!prevDate) return true;
  const prev = new Date(prevDate);
  switch (frequency) {
    case 'monthly':
      return cur.getMonth() !== prev.getMonth() || cur.getFullYear() !== prev.getFullYear();
    case 'quarterly': {
      const cq = Math.floor(cur.getMonth() / 3),
        pq = Math.floor(prev.getMonth() / 3);
      return cq !== pq || cur.getFullYear() !== prev.getFullYear();
    }
    case 'annual':
      return cur.getFullYear() !== prev.getFullYear();
    case 'weekly': {
      const cw = getISOWeekNumber(currentDate),
        pw = getISOWeekNumber(prevDate);
      return cw !== pw || cur.getFullYear() !== prev.getFullYear();
    }
    case 'daily':
      return true;
    default:
      return false;
  }
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

interface CashflowContext {
  date: string;
  prevDate: string | null;
  dayIndex: number;
  startDate: string;
  portfolioValue: number;
  weights: number[];
  params: BacktestParameters;
  mwrrCashflows: Array<{ value: number; time: number }>;
}

function applyCashflowsForDate(ctx: CashflowContext): { value: number; holdings: number[] | null } {
  const { date, prevDate, dayIndex, startDate, portfolioValue, weights, params, mwrrCashflows } =
    ctx;
  const cfTime = dayIndex / TRADING_DAYS_PER_YEAR;
  let value = portfolioValue;
  let holdings: number[] | null = null;

  const apply = (type: string, amount: number) => {
    const sign = type === 'withdrawal' ? -1 : 1;
    value += sign * amount;
    holdings = weights.map((w) => value * w);
    mwrrCashflows.push({ value: sign * amount, time: cfTime });
  };

  for (const leg of params.cashflowLegs ?? []) {
    if (
      shouldApplyCashflow({
        frequency: leg.frequency,
        currentDate: date,
        prevDate,
        startDate,
        offset: leg.offset ?? 0,
        until: leg.until,
      })
    ) {
      apply(leg.type, leg.amount);
    }
  }

  for (const cf of params.oneTimeCashflows ?? []) {
    if (cf.date === date) apply(cf.type, cf.amount);
  }

  return { value, holdings };
}

interface UpdateHoldingsOpts {
  holdings: number[];
  tickers: string[];
  priceData: PriceData;
  date: string;
  prevDate: string | null;
  exchangeRates?: DateValueMap;
}

function updateHoldingsForDay(opts: UpdateHoldingsOpts): number {
  const { holdings, tickers, priceData, date, prevDate, exchangeRates } = opts;
  let totalValue = 0;
  for (let j = 0; j < tickers.length; j++) {
    const price = getPriceWithFx(priceData, tickers[j], date, exchangeRates);
    const prevPrice = prevDate
      ? getPriceWithFx(priceData, tickers[j], prevDate, exchangeRates)
      : null;
    if (price !== null && prevPrice !== null && prevPrice > 0) {
      const dailyReturn = (price - prevPrice) / prevPrice;
      holdings[j] = holdings[j] * (1 + dailyReturn);
    }
    totalValue += holdings[j];
  }
  return totalValue;
}

interface RebalanceOpts {
  portfolio: Portfolio;
  weights: number[];
  tickers: string[];
  date: string;
  prevDate: string | null;
  holdings: number[];
  portfolioValue: number;
  hooks?: BacktestHooks;
}

function handleRebalance(opts: RebalanceOpts): number[] {
  const { portfolio, weights, tickers, date, prevDate, holdings, portfolioValue, hooks } = opts;
  if (
    !shouldRebalance({
      frequency: portfolio.rebalanceFrequency,
      currentDate: date,
      prevDate,
      holdings,
      weights,
      portfolioValue,
      threshold: portfolio.rebalanceThreshold,
    })
  ) {
    return holdings;
  }
  const newHoldings = weights.map((w) => portfolioValue * w);
  hooks?.onRebalance?.({
    portfolioId: portfolio.id || portfolio.name,
    portfolioName: portfolio.name,
    date,
    reason: portfolio.rebalanceFrequency,
    currentWeights: Object.fromEntries(tickers.map((t, idx) => [t, weights[idx] * 100])),
  });
  return newHoldings;
}

interface GrowthCurveResult {
  growthCurve: Array<{ date: string; value: number }>;
  values: number[];
  mwrrCashflows: Array<{ value: number; time: number }>;
}

function createEmptyPortfolioResult(name: string): PortfolioResult {
  return {
    name,
    growthCurve: [],
    drawdownCurve: [],
    rollingReturns: [],
    annualReturns: [],
    monthlyReturns: [],
    statistics: {
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
      var5: 0,
      cvar5: 0,
      skewness: 0,
      excessKurtosis: 0,
      pctPositiveDays: 0,
      maxDailyReturn: 0,
      minDailyReturn: 0,
    },
  };
}

function buildGrowthCurve(opts: {
  portfolio: Portfolio;
  priceData: PriceData;
  dates: string[];
  params: BacktestParameters;
  exchangeRates?: DateValueMap;
  hooks?: BacktestHooks;
}): GrowthCurveResult {
  const { portfolio, priceData, dates, params, exchangeRates, hooks } = opts;
  const { startingValue } = params;
  const tickers = portfolio.assets.map((a) => a.ticker);
  const weights = portfolio.assets.map((a) => a.weight / 100);

  const growthCurve: Array<{ date: string; value: number }> = [];
  const values: number[] = [];
  const mwrrCashflows: Array<{ value: number; time: number }> = [
    { value: -startingValue, time: 0 },
  ];

  let holdings: number[] = portfolio.assets.map((a) => (startingValue * a.weight) / 100);
  let liquidated = false;
  let prevDate: string | null = null;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];

    if (liquidated) {
      growthCurve.push({ date, value: 0 });
      values.push(0);
      prevDate = date;
      continue;
    }

    const totalValue = updateHoldingsForDay({
      holdings,
      tickers,
      priceData,
      date,
      prevDate,
      exchangeRates,
    });
    let portfolioValue = totalValue;

    const cfResult = applyCashflowsForDate({
      date,
      prevDate,
      dayIndex: i,
      startDate: dates[0],
      portfolioValue,
      weights,
      params,
      mwrrCashflows,
    });
    portfolioValue = cfResult.value;
    if (cfResult.holdings) holdings = cfResult.holdings;

    if (portfolioValue <= 0) {
      liquidated = true;
      portfolioValue = 0;
      holdings = holdings.map(() => 0);
      growthCurve.push({ date, value: 0 });
      values.push(0);
      prevDate = date;
      continue;
    }

    holdings = handleRebalance({
      portfolio,
      weights,
      tickers,
      date,
      prevDate,
      holdings,
      portfolioValue,
      hooks,
    });

    growthCurve.push({ date, value: portfolioValue });
    values.push(portfolioValue);
    prevDate = date;
  }

  return { growthCurve, values, mwrrCashflows };
}

function applyInflationAdjustment(
  values: number[],
  growthCurve: Array<{ date: string; value: number }>,
  dates: string[],
  cpiData?: DateValueMap,
): void {
  if (!cpiData || Object.keys(cpiData).length === 0) return;
  const startCpi = findCpiForDate(dates[0], cpiData);
  if (startCpi <= 0) return;
  for (let i = 0; i < dates.length; i++) {
    const dateCpi = findCpiForDate(dates[i], cpiData);
    if (dateCpi > 0) {
      const realValue = values[i] * (startCpi / dateCpi);
      growthCurve[i].value = realValue;
      values[i] = realValue;
    }
  }
}

interface BenchmarkMetrics {
  beta: number;
  alpha: number;
  rSquared: number;
  trackingError: number;
  informationRatio: number;
  upsideCapture: number;
  downsideCapture: number;
}

function calcBenchmarkMetrics(
  dailyReturns: number[],
  cagr: number,
  benchmarkDailyReturns?: number[],
  benchmarkCagr?: number,
): BenchmarkMetrics {
  const hasBenchmark =
    benchmarkDailyReturns && benchmarkDailyReturns.length >= 2 && benchmarkCagr !== undefined;
  if (!hasBenchmark) {
    return {
      beta: 0,
      alpha: 0,
      rSquared: 0,
      trackingError: 0,
      informationRatio: 0,
      upsideCapture: 0,
      downsideCapture: 0,
    };
  }
  const bench = benchmarkDailyReturns!;
  const beta = calcBeta(dailyReturns, bench);
  const alpha = calcAlpha(cagr, beta, benchmarkCagr!);
  const trackingError = calcTrackingError(dailyReturns, bench);
  return {
    beta,
    alpha,
    rSquared: calcRSquared(dailyReturns, bench),
    trackingError,
    informationRatio: calcInformationRatio(alpha, trackingError),
    upsideCapture: calcUpsideCapture(dailyReturns, bench),
    downsideCapture: calcDownsideCapture(dailyReturns, bench),
  };
}

function buildStatisticsObject(args: {
  cagr: number;
  mwrr: number;
  stdev: number;
  dailyReturns: number[];
  values: number[];
  startingValue: number;
  finalValue: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  annualReturnValues: number[];
  monthlyReturnValues: number[];
  benchmarkMetrics: ReturnType<typeof calcBenchmarkMetrics>;
}): Statistics {
  const {
    cagr,
    mwrr,
    stdev,
    dailyReturns,
    values,
    startingValue,
    finalValue,
    maxDrawdown,
    maxDrawdownDuration,
    annualReturnValues,
    monthlyReturnValues,
    benchmarkMetrics: bm,
  } = args;
  const avgDrawdown = calcAvgDrawdown(values);
  const ulcerIndex = calcUlcerIndex(values);
  const calmar = calcCalmar(cagr, maxDrawdown);
  const ulcerPerformanceIndex = calcUPI(cagr, ulcerIndex);
  const var5 = calcVaR(dailyReturns, 0.95);
  const cvar5 = calcCVaR(dailyReturns, 0.95);
  const skewness = calcSkewness(dailyReturns);
  const excessKurtosis = calcExcessKurtosis(dailyReturns);
  const totalReturn = calcTotalReturn(startingValue, finalValue);
  const pctPositiveDays =
    dailyReturns.length > 0 ? dailyReturns.filter((r) => r > 0).length / dailyReturns.length : 0;
  const maxDailyReturn = dailyReturns.length > 0 ? Math.max(...dailyReturns) : 0;
  const minDailyReturn = dailyReturns.length > 0 ? Math.min(...dailyReturns) : 0;
  const pwr = calcPWR(annualReturnValues);

  return {
    cagr,
    mwrr,
    stdev,
    sharpe: calcSharpe(cagr, stdev),
    sortino: calcSortino(cagr, dailyReturns),
    maxDrawdown,
    maxDrawdownDuration,
    bestYear: calcBestYear(annualReturnValues),
    worstYear: calcWorstYear(annualReturnValues),
    avgYear:
      annualReturnValues.length > 0
        ? annualReturnValues.reduce((s, r) => s + r, 0) / annualReturnValues.length
        : 0,
    totalReturn,
    maxMonthlyReturn: calcBestMonth(monthlyReturnValues),
    minMonthlyReturn: calcWorstMonth(monthlyReturnValues),
    avgDrawdown,
    ulcerIndex,
    calmar,
    ulcerPerformanceIndex,
    beta: bm.beta,
    alpha: bm.alpha,
    rSquared: bm.rSquared,
    trackingError: bm.trackingError,
    informationRatio: bm.informationRatio,
    upsideCapture: bm.upsideCapture,
    downsideCapture: bm.downsideCapture,
    var5,
    cvar5,
    skewness,
    excessKurtosis,
    pctPositiveDays,
    maxDailyReturn,
    minDailyReturn,
    pwr,
  };
}

function calculatePortfolioStatistics(opts: {
  values: number[];
  dates: string[];
  startingValue: number;
  dailyReturns: number[];
  annualReturns: Array<{ year: number; return: number }>;
  monthlyReturns: Array<{ year: number; month: number; return: number }>;
  mwrrCashflows: Array<{ value: number; time: number }>;
  benchmarkDailyReturns?: number[];
  benchmarkCagr?: number;
}): Statistics {
  const {
    values,
    dates,
    startingValue,
    dailyReturns,
    annualReturns,
    monthlyReturns,
    mwrrCashflows,
    benchmarkDailyReturns,
    benchmarkCagr,
  } = opts;
  const finalValue = values[values.length - 1];
  const years = dates.length / TRADING_DAYS_PER_YEAR;
  const cagr = finalValue <= 0 ? -1 : calcCAGR(startingValue, finalValue, years);
  const stdev = calcAnnualizedStdev(dailyReturns);
  const { maxDrawdown, maxDrawdownDuration } = calcMaxDrawdown(values);

  mwrrCashflows.push({ value: finalValue, time: years });
  const mwrr = finalValue > 0 ? calcMWRR(mwrrCashflows) : -1;

  const annualReturnValues = annualReturns.map((a) => a.return);
  const monthlyReturnValues = monthlyReturns.map((m) => m.return);

  return buildStatisticsObject({
    cagr,
    mwrr,
    stdev,
    dailyReturns,
    values,
    startingValue,
    finalValue,
    maxDrawdown,
    maxDrawdownDuration,
    annualReturnValues,
    monthlyReturnValues,
    benchmarkMetrics: calcBenchmarkMetrics(
      dailyReturns,
      cagr,
      benchmarkDailyReturns,
      benchmarkCagr,
    ),
  });
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

function calcDrawdownCurve(
  values: number[],
  dates: string[],
): Array<{ date: string; drawdown: number }> {
  const result: Array<{ date: string; drawdown: number }> = [];
  let peak = values[0];

  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) peak = values[i];
    const drawdown = peak > 0 ? (peak - values[i]) / peak : 0;
    result.push({ date: dates[i], drawdown });
  }

  return result;
}

function calcRollingReturns(
  values: number[],
  dates: string[],
  windowMonths: number,
): Array<{ date: string; return: number }> {
  const result: Array<{ date: string; return: number }> = [];
  const windowDays = Math.round((windowMonths * TRADING_DAYS_PER_YEAR) / 12);

  for (let i = windowDays; i < values.length; i++) {
    if (values[i - windowDays] > 0) {
      const rollingReturn = values[i] / values[i - windowDays] - 1;
      result.push({ date: dates[i], return: rollingReturn });
    }
  }

  return result;
}

function calcAnnualReturns(
  values: number[],
  dates: string[],
): Array<{ year: number; return: number }> {
  const result: Array<{ year: number; return: number }> = [];

  const yearLastValue = new Map<number, number>();
  for (let i = 0; i < values.length; i++) {
    const year = new Date(dates[i]).getFullYear();
    yearLastValue.set(year, values[i]);
  }

  const sortedYears = Array.from(yearLastValue.keys()).sort((a, b) => a - b);

  for (let idx = 0; idx < sortedYears.length; idx++) {
    const year = sortedYears[idx];
    const endValue = yearLastValue.get(year) ?? 0;
    let startValue: number;

    if (idx === 0) {
      startValue = values[0];
    } else {
      startValue = yearLastValue.get(sortedYears[idx - 1]) ?? 0;
    }

    if (startValue > 0) {
      result.push({ year, return: endValue / startValue - 1 });
    }
  }

  return result;
}

function calcMonthlyReturns(
  values: number[],
  dates: string[],
): Array<{ year: number; month: number; return: number }> {
  const result: Array<{ year: number; month: number; return: number }> = [];
  const monthMap = new Map<string, { firstValue: number; lastValue: number }>();

  for (let i = 0; i < values.length; i++) {
    const d = new Date(dates[i]);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, { firstValue: values[i], lastValue: values[i] });
    } else {
      const entry = monthMap.get(key);
      if (entry) entry.lastValue = values[i];
    }
  }

  for (const [key, { firstValue, lastValue }] of monthMap) {
    const [year, month] = key.split('-').map(Number);
    if (firstValue > 0) {
      result.push({ year, month: month + 1, return: lastValue / firstValue - 1 });
    }
  }

  return result.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
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
