/**
 * 组合回测核心逻辑（Node.js降级后备）
 * 优先使用Rust引擎(localhost:5002)，此文件仅在Rust引擎不可用时启用
 * 对应Rust实现: engine-rs/src/engine.rs
 */

import type {
  Portfolio,
  BacktestParameters,
  PortfolioResult,
  BacktestResult,
  AssetAnalysisResult,
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
import { filterDates } from './dateUtils.js';
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
type DateValueMap = Record<string, number>;

/**
 * 查找指定日期的 CPI 值（带月初回溯）
 * 对应 Rust: find_cpi_for_date
 */
function findCpiForDate(date: string, cpiData: DateValueMap): number {
  if (date.length < 10) return 0;
  if (cpiData[date] !== undefined) return cpiData[date];
  // 回溯到月初查找
  const monthStart = date.substring(0, 8) + '01';
  if (cpiData[monthStart] !== undefined) return cpiData[monthStart];
  // 向前查找最近 10 天
  const d = new Date(date);
  for (let i = 0; i < 10; i++) {
    d.setDate(d.getDate() - 1);
    const key = d.toISOString().substring(0, 10);
    if (cpiData[key] !== undefined) return cpiData[key];
  }
  return 0;
}

/**
 * 获取价格并应用汇率转换（当 exchangeRates 非空时将 USD 转为 CNY）
 * 对应 Rust: gp 闭包中的汇率转换逻辑
 */
function getPriceWithFx(
  priceData: PriceData,
  ticker: string,
  date: string,
  exchangeRates?: DateValueMap,
): number | null {
  const raw = getPrice(priceData, ticker, date);
  if (raw === null) return null;
  // 无汇率数据时直接返回原始价格（包括 0 或负值，保持与原 getPrice 一致的行为）
  if (!exchangeRates || Object.keys(exchangeRates).length === 0) return raw;
  // 价格 <= 0 时无需汇率转换
  if (raw <= 0) return raw;
  // 精确日期匹配
  if (exchangeRates[date] !== undefined) return raw * exchangeRates[date];
  // 回溯查找最近 10 天的汇率
  const d = new Date(date);
  for (let i = 0; i < 10; i++) {
    d.setDate(d.getDate() - 1);
    const key = d.toISOString().substring(0, 10);
    if (exchangeRates[key] !== undefined) return raw * exchangeRates[key];
  }
  return raw;
}

function shouldApplyCashflow(
  frequency: string,
  currentDate: string,
  prevDate: string | null,
  startDate: string,
  offset: number,
  until?: string,
): boolean {
  if (until && currentDate > until) return false;
  const cur = new Date(currentDate);
  const start = new Date(startDate);
  const daysSinceStart = Math.floor((cur.getTime() - start.getTime()) / 86400000);
  if (daysSinceStart < offset) return false;
  if (!prevDate) return true;
  const prev = new Date(prevDate);
  switch (frequency) {
    case 'monthly': return cur.getMonth() !== prev.getMonth() || cur.getFullYear() !== prev.getFullYear();
    case 'quarterly': { const cq = Math.floor(cur.getMonth() / 3), pq = Math.floor(prev.getMonth() / 3); return cq !== pq || cur.getFullYear() !== prev.getFullYear(); }
    case 'annual': return cur.getFullYear() !== prev.getFullYear();
    case 'weekly': { const cw = getISOWeekNumber(currentDate), pw = getISOWeekNumber(prevDate); return cw !== pw || cur.getFullYear() !== prev.getFullYear(); }
    case 'daily': return true;
    default: return false;
  }
}

/**
 * 运行单个组合回测
 */
function runSinglePortfolio(
  portfolio: Portfolio,
  priceData: PriceData,
  dates: string[],
  params: BacktestParameters,
  benchmarkDailyReturns?: number[],
  benchmarkCagr?: number,
  cpiData?: DateValueMap,
  exchangeRates?: DateValueMap,
): PortfolioResult {
  const { startingValue } = params;
  const tickers = portfolio.assets.map((a) => a.ticker);
  const weights = portfolio.assets.map((a) => a.weight / 100);

  // 空组合直接返回空结果
  if (portfolio.assets.length === 0) {
    return {
      name: portfolio.name,
      growthCurve: [],
      drawdownCurve: [],
      rollingReturns: [],
      annualReturns: [],
      monthlyReturns: [],
      statistics: {
        cagr: 0, mwrr: 0, stdev: 0, sharpe: 0, sortino: 0,
        maxDrawdown: 0, maxDrawdownDuration: 0,
        bestYear: 0, worstYear: 0, avgYear: 0,
        totalReturn: 0,
        maxMonthlyReturn: 0, minMonthlyReturn: 0,
        avgDrawdown: 0, ulcerIndex: 0,
        calmar: 0, ulcerPerformanceIndex: 0,
        beta: 0, alpha: 0, rSquared: 0,
        trackingError: 0, informationRatio: 0,
        upsideCapture: 0, downsideCapture: 0,
        var5: 0, cvar5: 0,
        skewness: 0, excessKurtosis: 0,
        pctPositiveDays: 0, maxDailyReturn: 0, minDailyReturn: 0,
      },
    };
  }

  // 构建净值曲线
  const growthCurve: Array<{ date: string; value: number }> = [];
  const values: number[] = [];

  let portfolioValue = startingValue;
  // 持仓数量（各资产的市值）
  // weight 是百分比（如 60 表示 60%），需要除以 100
  let holdings: number[] = portfolio.assets.map((a) => startingValue * a.weight / 100);
  let liquidated = false; // 是否已爆仓

  let prevDate: string | null = null;

  // 收集 MWRR 所需的现金流（金额 + 时间点）
  const mwrrCashflows: Array<{ value: number; time: number }> = [
    { value: -startingValue, time: 0 },
  ];

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];

    // 已爆仓则不再计算，组合价值归零
    if (liquidated) {
      growthCurve.push({ date, value: 0 });
      values.push(0);
      prevDate = date;
      continue;
    }

    // 计算各资产当日收益率并更新持仓
    let totalValue = 0;
    for (let j = 0; j < tickers.length; j++) {
      const price = getPriceWithFx(priceData, tickers[j], date, exchangeRates);
      const prevPrice = prevDate ? getPriceWithFx(priceData, tickers[j], prevDate, exchangeRates) : null;

      if (price !== null && prevPrice !== null && prevPrice > 0) {
        const dailyReturn = (price - prevPrice) / prevPrice;
        holdings[j] = holdings[j] * (1 + dailyReturn);
      }
      totalValue += holdings[j];
    }

    portfolioValue = totalValue;

    // 处理现金流（周期性 + 一次性）
    const cashflowLegs = params.cashflowLegs;
    const oneTimeCashflows = params.oneTimeCashflows;

    if (cashflowLegs && cashflowLegs.length > 0) {
      for (const leg of cashflowLegs) {
        const sign = leg.type === 'withdrawal' ? -1 : 1;
        const apply = shouldApplyCashflow(leg.frequency, date, prevDate, dates[0], leg.offset ?? 0, leg.until);
        if (apply) {
          portfolioValue += sign * leg.amount;
          holdings = weights.map((w) => portfolioValue * w);
          const cfTime = i / TRADING_DAYS_PER_YEAR;
          mwrrCashflows.push({ value: sign * leg.amount, time: cfTime });
        }
      }
    }
    if (oneTimeCashflows && oneTimeCashflows.length > 0) {
      for (const cf of oneTimeCashflows) {
        if (cf.date === date) {
          const sign = cf.type === 'withdrawal' ? -1 : 1;
          portfolioValue += sign * cf.amount;
          holdings = weights.map((w) => portfolioValue * w);
          const cfTime = i / TRADING_DAYS_PER_YEAR;
          mwrrCashflows.push({ value: sign * cf.amount, time: cfTime });
        }
      }
    }

    // 爆仓检测：组合价值 <= 0 时清仓
    if (portfolioValue <= 0) {
      liquidated = true;
      portfolioValue = 0;
      holdings = holdings.map(() => 0);
      growthCurve.push({ date, value: 0 });
      values.push(0);
      prevDate = date;
      continue;
    }

    // 再平衡
    if (shouldRebalance({
      frequency: portfolio.rebalanceFrequency,
      currentDate: date,
      prevDate,
      holdings,
      weights,
      portfolioValue,
      threshold: portfolio.rebalanceThreshold,
    })) {
      holdings = weights.map((w) => portfolioValue * w);
    }

    growthCurve.push({ date, value: portfolioValue });
    values.push(portfolioValue);
    prevDate = date;
  }

  // 通胀调整：将名义值转为实际值（对应 Rust: lines 1256-1269）
  if (params.adjustForInflation && cpiData && Object.keys(cpiData).length > 0) {
    const startCpi = findCpiForDate(dates[0], cpiData);
    if (startCpi > 0) {
      for (let i = 0; i < dates.length; i++) {
        const dateCpi = findCpiForDate(dates[i], cpiData);
        if (dateCpi > 0) {
          const realValue = values[i] * (startCpi / dateCpi);
          growthCurve[i].value = realValue;
          values[i] = realValue;
        }
      }
    }
  }

  // 计算回撤曲线
  const drawdownCurve = calcDrawdownCurve(values, dates);

  // 计算滚动收益
  const rollingReturns = calcRollingReturns(values, dates, params.rollingWindowMonths);

  // 计算年度收益
  const annualReturns = calcAnnualReturns(values, dates);

  // 计算月度收益
  const monthlyReturns = calcMonthlyReturns(values, dates);

  // 计算统计指标
  const finalValue = values[values.length - 1];
  const dailyReturns = calcDailyReturns(values);
  const years = dates.length / TRADING_DAYS_PER_YEAR;
  // 爆仓（finalValue <= 0）时 CAGR = -1 作为爆仓标志
  const cagr = finalValue <= 0 ? -1 : calcCAGR(startingValue, finalValue, years);
  const stdev = calcAnnualizedStdev(dailyReturns);
  const { maxDrawdown, maxDrawdownDuration } = calcMaxDrawdown(values);

  // MWRR: 使用收集到的所有现金流（初始投入 + 中间现金流 + 期末价值）
  mwrrCashflows.push({ value: finalValue, time: years });
  const mwrr = finalValue > 0 ? calcMWRR(mwrrCashflows) : -1;

  // 年度/月度收益数组（纯数值）
  const annualReturnValues = annualReturns.map((a) => a.return);
  const monthlyReturnValues = monthlyReturns.map((m) => m.return);

  // 基准相关指标（有基准时才计算）
  const hasBenchmark = benchmarkDailyReturns && benchmarkDailyReturns.length >= 2 && benchmarkCagr !== undefined;
  const beta = hasBenchmark ? calcBeta(dailyReturns, benchmarkDailyReturns!) : 0;
  const alpha = hasBenchmark ? calcAlpha(cagr, beta, benchmarkCagr!) : 0;
  const rSquared = hasBenchmark ? calcRSquared(dailyReturns, benchmarkDailyReturns!) : 0;
  const trackingError = hasBenchmark ? calcTrackingError(dailyReturns, benchmarkDailyReturns!) : 0;
  const informationRatio = hasBenchmark ? calcInformationRatio(alpha, trackingError) : 0;
  const upsideCapture = hasBenchmark ? calcUpsideCapture(dailyReturns, benchmarkDailyReturns!) : 0;
  const downsideCapture = hasBenchmark ? calcDownsideCapture(dailyReturns, benchmarkDailyReturns!) : 0;

  // 回撤相关
  const avgDrawdown = calcAvgDrawdown(values);
  const ulcerIndex = calcUlcerIndex(values);

  // 风险调整比率
  const calmar = calcCalmar(cagr, maxDrawdown);
  const ulcerPerformanceIndex = calcUPI(cagr, ulcerIndex);

  // VaR / CVaR (95% 置信度)
  const var5 = calcVaR(dailyReturns, 0.95);
  const cvar5 = calcCVaR(dailyReturns, 0.95);

  // 分布特征
  const skewness = calcSkewness(dailyReturns);
  const excessKurtosis = calcExcessKurtosis(dailyReturns);

  // 辅助指标
  const totalReturn = calcTotalReturn(startingValue, finalValue);
  const pctPositiveDays = dailyReturns.length > 0
    ? dailyReturns.filter((r) => r > 0).length / dailyReturns.length
    : 0;
  const maxDailyReturn = dailyReturns.length > 0 ? Math.max(...dailyReturns) : 0;
  const minDailyReturn = dailyReturns.length > 0 ? Math.min(...dailyReturns) : 0;

  // PWR（永续提款率）
  const pwr = calcPWR(annualReturnValues);

  const statistics = {
    cagr,
    mwrr,
    stdev,
    sharpe: calcSharpe(cagr, stdev),
    sortino: calcSortino(cagr, dailyReturns),
    maxDrawdown,
    maxDrawdownDuration,
    bestYear: calcBestYear(annualReturnValues),
    worstYear: calcWorstYear(annualReturnValues),
    avgYear: annualReturnValues.length > 0
      ? annualReturnValues.reduce((s, r) => s + r, 0) / annualReturnValues.length
      : 0,
    totalReturn,
    maxMonthlyReturn: calcBestMonth(monthlyReturnValues),
    minMonthlyReturn: calcWorstMonth(monthlyReturnValues),
    avgDrawdown,
    ulcerIndex,
    calmar,
    ulcerPerformanceIndex,
    beta,
    alpha,
    rSquared,
    trackingError,
    informationRatio,
    upsideCapture,
    downsideCapture,
    var5,
    cvar5,
    skewness,
    excessKurtosis,
    pctPositiveDays,
    maxDailyReturn,
    minDailyReturn,
    pwr,
  };

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

/** 计算回撤曲线 */
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

/** 计算滚动收益 */
function calcRollingReturns(
  values: number[],
  dates: string[],
  windowMonths: number,
): Array<{ date: string; return: number }> {
  const result: Array<{ date: string; return: number }> = [];
  const windowDays = Math.round(windowMonths * TRADING_DAYS_PER_YEAR / 12);

  for (let i = windowDays; i < values.length; i++) {
    if (values[i - windowDays] > 0) {
      const rollingReturn = values[i] / values[i - windowDays] - 1;
      result.push({ date: dates[i], return: rollingReturn });
    }
  }

  return result;
}

/** 计算年度收益（使用前一年最后交易日的值作为起始值） */
function calcAnnualReturns(
  values: number[],
  dates: string[],
): Array<{ year: number; return: number }> {
  const result: Array<{ year: number; return: number }> = [];

  // 先收集每年的最后交易日的值
  const yearLastValue = new Map<number, number>();
  for (let i = 0; i < values.length; i++) {
    const year = new Date(dates[i]).getFullYear();
    yearLastValue.set(year, values[i]);
  }

  const sortedYears = Array.from(yearLastValue.keys()).sort((a, b) => a - b);

  for (let idx = 0; idx < sortedYears.length; idx++) {
    const year = sortedYears[idx];
    const endValue = yearLastValue.get(year)!;
    let startValue: number;

    if (idx === 0) {
      // 第一年：使用第一个可用值
      startValue = values[0];
    } else {
      // 非第一年：使用前一年最后交易日的值
      startValue = yearLastValue.get(sortedYears[idx - 1])!;
    }

    if (startValue > 0) {
      result.push({ year, return: endValue / startValue - 1 });
    }
  }

  return result;
}

/** 计算月度收益 */
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
      monthMap.get(key)!.lastValue = values[i];
    }
  }

  for (const [key, { firstValue, lastValue }] of monthMap) {
    const [year, month] = key.split('-').map(Number);
    if (firstValue > 0) {
      result.push({ year, month: month + 1, return: lastValue / firstValue - 1 });
    }
  }

  return result.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
}

/**
 * 运行组合回测（主入口）
 */
export function runPortfolioBacktest(
  portfolios: Portfolio[],
  priceData: PriceData,
  params: BacktestParameters,
  cpiData?: DateValueMap,
  exchangeRates?: DateValueMap,
): BacktestResult {
  const dates = getSortedDates(priceData);

  // 过滤日期范围（空字符串视为不限制）
  const filteredDates = filterDates(dates, params.startDate, params.endDate);

  // 预计算基准日收益率和CAGR（供各组合的基准相关指标使用）
  let benchmarkDailyReturns: number[] | undefined;
  let benchmarkCagr: number | undefined;
  let benchmarkGrowth: Array<{ date: string; value: number }> | undefined;

  if (params.benchmarkTicker && priceData[params.benchmarkTicker]) {
    const benchmarkPrices = filteredDates
      .map((d) => ({ date: d, price: getPriceWithFx(priceData, params.benchmarkTicker!, d, exchangeRates) }))
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
    runSinglePortfolio(p, priceData, filteredDates, params, benchmarkDailyReturns, benchmarkCagr, cpiData, exchangeRates),
  );

  // 计算相关性矩阵
  const correlations = calcCorrelationMatrix(portfolioResults);

  return {
    portfolios: portfolioResults,
    correlations,
    benchmarkGrowth,
  };
}

/** 计算相关性矩阵 */
function calcCorrelationMatrix(
  portfolioResults: PortfolioResult[],
): number[][] {
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

/**
 * 运行资产分析
 */
export function runAnalysis(
  tickers: string[],
  priceData: PriceData,
  params: BacktestParameters,
): AssetAnalysisResult {
  const dates = getSortedDates(priceData);
  // 空字符串视为不限制
  const filteredDates = filterDates(dates, params.startDate, params.endDate);

  // 预计算所有资产的日收益率（用于Beta等基准相关指标）
  const allPrices = tickers.map((ticker) =>
    filteredDates
      .map((d) => getPrice(priceData, ticker, d))
      .filter((p): p is number => p !== null)
  );
  const allReturns = allPrices.map((prices) => calcDailyReturns(prices));

  const results = tickers.map((ticker, tIdx) => {
    const prices = allPrices[tIdx];

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

    // 净值曲线
    const basePrice = prices[0];
    const values = prices.map((p) => p / basePrice);
    const growthCurve = filteredDates.slice(0, prices.length).map((d, i) => ({
      date: d,
      value: values[i] * params.startingValue,
    }));

    // 回撤曲线
    const drawdownCurve = calcDrawdownCurve(values, filteredDates.slice(0, prices.length));

    // 日收益率
    const dailyReturns = allReturns[tIdx];

    // 滚动收益
    const rollingReturns = calcRollingReturns(values.map((v) => v * params.startingValue), filteredDates.slice(0, prices.length), params.rollingWindowMonths);

    // 年度收益
    const annualReturns = calcAnnualReturns(values.map((v) => v * params.startingValue), filteredDates.slice(0, prices.length));

    // 月度收益
    const monthlyReturns = calcMonthlyReturns(values.map((v) => v * params.startingValue), filteredDates.slice(0, prices.length));

    // 统计
    const years = prices.length / TRADING_DAYS_PER_YEAR;
    const cagr = calcCAGR(prices[0], prices[prices.length - 1], years);
    const stdev = calcAnnualizedStdev(dailyReturns);
    const { maxDrawdown, maxDrawdownDuration } = calcMaxDrawdown(prices);
    const avgDrawdown = calcAvgDrawdown(prices);
    const ulcerIndex = calcUlcerIndex(prices);
    const calmar = calcCalmar(cagr, maxDrawdown);
    const ulcerPerformanceIndex = calcUPI(cagr, ulcerIndex);
    const sortino = calcSortino(cagr, dailyReturns);
    const skewness = calcSkewness(dailyReturns);
    const excessKurtosis = calcExcessKurtosis(dailyReturns);

    // Beta（相对第一个资产）
    const benchmarkIdx = 0;
    const beta = tIdx !== benchmarkIdx && allReturns[benchmarkIdx].length >= 2
      ? calcBeta(dailyReturns, allReturns[benchmarkIdx])
      : tIdx === benchmarkIdx ? 1 : 0;

    // 年度/月度收益数组
    const annualReturnValues = annualReturns.map((a) => a.return);
    const monthlyReturnValues = monthlyReturns.map((m) => m.return);

    return {
      ticker,
      growthCurve,
      drawdownCurve,
      dailyReturns,
      annualReturns,
      monthlyReturns,
      rollingReturns,
      statistics: {
        cagr,
        stdev,
        sharpe: calcSharpe(cagr, stdev),
        sortino,
        maxDrawdown,
        maxDrawdownDuration,
        avgDrawdown,
        ulcerIndex,
        calmar,
        ulcerPerformanceIndex,
        beta,
        skewness,
        excessKurtosis,
        bestYear: calcBestYear(annualReturnValues),
        worstYear: calcWorstYear(annualReturnValues),
        avgYear: annualReturnValues.length > 0
          ? annualReturnValues.reduce((s, r) => s + r, 0) / annualReturnValues.length
          : 0,
        totalReturn: calcTotalReturn(prices[0], prices[prices.length - 1]),
        var5: calcVaR(dailyReturns, 0.95),
        cvar5: calcCVaR(dailyReturns, 0.95),
        pctPositiveDays: dailyReturns.length > 0
          ? dailyReturns.filter((r) => r > 0).length / dailyReturns.length
          : 0,
        maxDailyReturn: dailyReturns.length > 0 ? Math.max(...dailyReturns) : 0,
        minDailyReturn: dailyReturns.length > 0 ? Math.min(...dailyReturns) : 0,
        maxMonthlyReturn: calcBestMonth(monthlyReturnValues),
        minMonthlyReturn: calcWorstMonth(monthlyReturnValues),
      },
    };
  });

  // 相关性矩阵
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

/**
 * 计算 drag（拖累）近似值
 * 在 Node.js 降级引擎中作为 Rust 引擎 drag 计算的备用方案
 *
 * Rust 引擎在回测主循环内按日复利应用 drag（每日因子 = (1 - drag/100)^(1/TRADING_DAYS_PER_YEAR)），
 * 直接影响净值曲线。降级引擎未在主循环中实现该逻辑，此处作为事后近似：
 * 将年化 drag 按交易日线性分摊到每个时间点，累积得到 drag 系列。
 *
 * @param portfolioValue - 组合价值序列（与 growthCurve.value 一一对应）
 * @param cashflows - 现金流列表（预留参数，当前实现未参与计算）
 * @param rebalanceFrequency - 再平衡频率（预留参数，当前实现未参与计算）
 * @param dragPct - drag 百分比（年化，小数形式，默认 0.001 即 0.1%）
 * @returns drag 计算结果，包含累积 drag、年化 drag 与 drag 系列
 */
export function calculateDrag(
  portfolioValue: number[],
  cashflows: Array<{ date: string; amount: number }>,
  rebalanceFrequency: string,
  dragPct: number = 0.001,
): {
  totalDrag: number;
  annualDrag: number;
  dragSeries: number[];
} {
  // 空序列直接返回零值，避免除零
  if (portfolioValue.length === 0) {
    return { totalDrag: 0, annualDrag: 0, dragSeries: [] };
  }

  // drag 系列：每个时间点的累积 drag
  const dragSeries: number[] = [];
  let cumulativeDrag = 0;

  for (let i = 0; i < portfolioValue.length; i++) {
    // 每个时间点的 drag = 前一期价值 * dragPct / 期数
    const prevValue = i > 0 ? portfolioValue[i - 1] : portfolioValue[0];
    const periodDrag = (prevValue * dragPct) / TRADING_DAYS_PER_YEAR; // 年化 drag 分摊到交易日
    cumulativeDrag += periodDrag;
    dragSeries.push(cumulativeDrag);
  }

  // 年化 drag
  const years = portfolioValue.length / TRADING_DAYS_PER_YEAR;
  const finalValue = portfolioValue[portfolioValue.length - 1];
  const annualDrag = years > 0 && finalValue !== 0 ? cumulativeDrag / years / finalValue : 0;

  return {
    totalDrag: cumulativeDrag,
    annualDrag,
    dragSeries,
  };
}
