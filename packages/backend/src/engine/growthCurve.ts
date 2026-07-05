/**
 * 组合增长曲线计算（Node.js 参照实现）
 * 主引擎为 Go(engine-go, localhost:5004)；本文件作为一致性测试的 parity 参照保留，
 * 不用于线上降级（ADR-031 fail-closed）。
 * 对应 Go 实现: engine-go/internal/engine/backtest.go
 */

import type { Portfolio, BacktestParameters, PortfolioResult } from '@backtest/shared/types.js';
import type { PriceData, BacktestHooks } from './portfolio.js';
import { shouldRebalance, getISOWeekNumber } from './rebalance.js';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants.js';

/** CPI/汇率数据格式：{ [date: string]: number } */
export type DateValueMap = Record<string, number>;

/** getSortedDates 缓存 */
const sortedDatesCache = new WeakMap<PriceData, string[]>();

/** 获取所有交易日期（排序后的日期数组，带缓存） */
export function getSortedDates(priceData: PriceData): string[] {
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
export function getPrice(priceData: PriceData, ticker: string, date: string): number | null {
  return priceData[ticker]?.[date] ?? null;
}

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
export function getPriceWithFx(
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

/** shouldApplyCashflow 参数对象 */
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

/** 单日现金流处理上下文 */
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

/**
 * 处理单日现金流（周期性 + 一次性），返回当日现金流总额和更新后的持仓
 */
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

  // 周期性现金流
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

  // 一次性现金流
  for (const cf of params.oneTimeCashflows ?? []) {
    if (cf.date === date) apply(cf.type, cf.amount);
  }

  return { value, holdings };
}

/** updateHoldingsForDay 的参数 */
interface UpdateHoldingsOpts {
  holdings: number[];
  tickers: string[];
  priceData: PriceData;
  date: string;
  prevDate: string | null;
  exchangeRates?: DateValueMap;
}

/** 计算各资产当日收益率并更新持仓，返回总价值 */
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

/** handleRebalance 的参数 */
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

/** 执行再平衡：将持仓重置为目标权重并触发回调 */
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

/** 增长曲线计算结果 */
interface GrowthCurveResult {
  growthCurve: Array<{ date: string; value: number }>;
  values: number[];
  mwrrCashflows: Array<{ value: number; time: number }>;
}

/**
 * 构建增长曲线：逐日计算持仓价值、处理现金流、再平衡和爆仓检测
 */
export function buildGrowthCurve(opts: {
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

    // 处理现金流
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

    // 爆仓检测
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

/**
 * 通胀调整：将名义值转为实际值
 */
export function applyInflationAdjustment(
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

/**
 * 创建空组合结果（资产为空时使用）
 */
export function createEmptyPortfolioResult(name: string): PortfolioResult {
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

/** 计算回撤曲线 */
export function calcDrawdownCurve(
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
export function calcRollingReturns(
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

/** 计算年度收益（使用前一年最后交易日的值作为起始值） */
export function calcAnnualReturns(
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
export function calcMonthlyReturns(
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

  return result.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
}
