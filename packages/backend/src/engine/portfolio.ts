/**
 * 组合回测核心逻辑（Node.js 参照实现）
 * 主引擎为 Go(engine-go, localhost:5004)；本文件作为一致性测试的 parity 参照保留，
 * 不用于线上降级（ADR-031 fail-closed）。
 * 对应 Go 实现: engine-go/internal/engine/backtest.go
 */

import type {
  Portfolio,
  BacktestParameters,
  PortfolioResult,
  BacktestResult,
  AssetAnalysisResult,
  Statistics,
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

/**
 * 再平衡钩子（T-30）：引擎在再平衡发生时通知应用层发布领域事件，避免 engine→domain 硬依赖。
 */
export interface BacktestHooks {
  onRebalance?: (info: {
    portfolioId: string;
    portfolioName: string;
    date: string;
    reason: string;
    currentWeights: Record<string, number>;
  }) => void;
}

/** runSinglePortfolio 参数对象（避免过多位置参数） */
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

/**
 * 运行单个组合回测
 */
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

  // 空组合直接返回空结果
  if (portfolio.assets.length === 0) {
    return createEmptyPortfolioResult(portfolio.name);
  }

  // 构建净值曲线
  const { growthCurve, values, mwrrCashflows } = buildGrowthCurve({
    portfolio,
    priceData,
    dates,
    params,
    exchangeRates,
    hooks,
  });

  // 通胀调整：将名义值转为实际值
  if (params.adjustForInflation) {
    applyInflationAdjustment(values, growthCurve, dates, cpiData);
  }

  // 计算回撤/滚动/年度/月度曲线
  const drawdownCurve = calcDrawdownCurve(values, dates);
  const rollingReturns = calcRollingReturns(values, dates, params.rollingWindowMonths);
  const annualReturns = calcAnnualReturns(values, dates);
  const monthlyReturns = calcMonthlyReturns(values, dates);

  // 计算统计指标
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

/** runPortfolioBacktest 的可选扩展参数 */
interface BacktestOptions {
  cpiData?: DateValueMap;
  exchangeRates?: DateValueMap;
  hooks?: BacktestHooks;
}

/**
 * 运行组合回测（主入口）
 */
export function runPortfolioBacktest(
  portfolios: Portfolio[],
  priceData: PriceData,
  params: BacktestParameters,
  options?: BacktestOptions,
): BacktestResult {
  const { cpiData, exchangeRates, hooks } = options ?? {};
  const dates = getSortedDates(priceData);

  // 过滤日期范围（空字符串视为不限制）
  const filteredDates = filterDates(dates, params.startDate, params.endDate);

  // 预计算基准日收益率和CAGR（供各组合的基准相关指标使用）
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

  // 计算相关性矩阵
  const correlations = calcCorrelationMatrix(portfolioResults);

  return {
    portfolios: portfolioResults,
    correlations,
    benchmarkGrowth,
  };
}

/** 计算相关性矩阵 */
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

/** 单标的分析参数 */
interface AnalyzeTickerOptions {
  ticker: string;
  tIdx: number;
  prices: number[];
  dailyReturns: number[];
  benchmarkReturns: number[];
  filteredDates: string[];
  params: BacktestParameters;
}

/**
 * 分析单个标的的收益、风险和统计指标
 */
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
  _cashflows: Array<{ date: string; amount: number }>,
  _rebalanceFrequency: string,
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
