/**
 * 战术网格搜索（Tactical Grid Search）核心算法
 *
 * Architecture: 网格搜索逻辑，从路由文件外迁
 * 企业为何需要：业务逻辑与HTTP处理耦合导致无法单元测试、无法复用
 * 权衡：增加一层间接调用，但可测试性和可维护性大幅提升
 *
 * 计算流程：
 *   1. 根据参数范围生成网格（笛卡尔积）
 *   2. 对每个参数组合：计算信号 → 构建合成价格序列 → 运行回测 → 记录指标
 *   3. 按优化目标排序
 *   4. 返回 Top N 结果 + 热力图数据矩阵
 *
 * 信号逻辑：
 *   - sma/ema: 价格突破均线 ± threshold% 时入场，跌破均线 ∓ threshold% 时离场
 *   - rsi: RSI < threshold 时入场（超卖），RSI > 100-threshold 时离场（超买）
 */

import type { Portfolio, RebalanceFrequency } from '@backtest/shared/types/index';
import type { Statistics } from '@backtest/shared/types/statistics';
import { numericRange } from '../utils/numericRange.js';
import { runPortfolioBacktest } from './portfolio.js';
import { shouldRebalance } from './rebalance.js';

// ===== 类型定义 =====

export type IndicatorType = 'sma' | 'ema' | 'rsi';
export type ObjectiveType = 'maxCAGR' | 'minDrawdown' | 'maxSharpe';

export interface ParamRange {
  min: number;
  max: number;
  step: number;
}

export interface TacticalGridRequest {
  indicator: IndicatorType;
  /** 参数 1 范围（周期） */
  param1: ParamRange;
  /** 参数 2 范围（阈值） */
  param2: ParamRange;
  tickers: string[];
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: RebalanceFrequency;
  objective: ObjectiveType;
  /** 返回 Top N 结果，默认 10 */
  topN?: number;
}

/** 单个参数组合的指标（不含曲线，用于全量返回） */
export interface GridCombinationMetrics {
  param1: number;
  param2: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  totalReturn: number;
  stdev: number;
  calmar: number;
}

/** Top 参数组合结果（含增长曲线） */
export interface TopCombinationResult extends GridCombinationMetrics {
  growthCurve: Array<{ date: string; value: number }>;
}

export interface HeatmapData {
  param1Label: string;
  param2Label: string;
  param1Values: number[];
  param2Values: number[];
  /** matrix[param1Idx][param2Idx] = 优化目标值 */
  matrix: (number | null)[][];
  objective: ObjectiveType;
}

export interface TacticalGridResponse {
  totalCombinations: number;
  allMetrics: GridCombinationMetrics[];
  topResults: TopCombinationResult[];
  heatmap: HeatmapData;
  bestCombination: TopCombinationResult;
}

// ===== 工具函数 =====

/** 生成参数序列 [min, min+step, ..., max]（T-24：复用共享 numericRange，精度 3 位保持原行为） */
export function generateRange(min: number, max: number, step: number): number[] {
  return numericRange(min, max, step, 3);
}

/** 计算简单移动平均 */
export function calcSMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(prices.length).fill(null);
  if (period <= 0) return result;
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

/** 计算指数移动平均 */
export function calcEMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(prices.length).fill(null);
  if (period <= 0 || prices.length === 0) return result;
  const k = 2 / (period + 1);
  let prev: number | null = null;
  if (prices.length >= period) {
    let sum = 0;
    for (let i = 0; i < period; i++) sum += prices[i];
    prev = sum / period;
    result[period - 1] = prev;
  }
  for (let i = period; i < prices.length; i++) {
    prev = prices[i] * k + (prev as number) * (1 - k);
    result[i] = prev;
  }
  return result;
}

/** 计算相对强弱指数（RSI） */
export function calcRSI(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(prices.length).fill(null);
  if (prices.length <= period || period <= 0) return result;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

/** generateSignals 的信号参数 */
interface SignalParams {
  /** 均线周期 / RSI 周期 */
  param1: number;
  /** 突破阈值(%) / RSI 超卖线 */
  param2: number;
  /** 再平衡频率，仅在再平衡日允许切换仓位 */
  rebalanceFrequency: RebalanceFrequency;
}

/**
 * 根据指标与参数生成持仓信号序列
 *
 * - sma/ema: 价格突破 均线*(1+threshold%) 时入场，跌破 均线*(1-threshold%) 时离场
 * - rsi: RSI < threshold 时入场（超卖），RSI > 100-threshold 时离场（超买）
 */
/** MA 信号参数 */
interface MaSignalOpts {
  indicator: IndicatorType;
  prices: number[];
  dates: string[];
  param1: number;
  param2: number;
  rebalanceFrequency: RebalanceFrequency;
}

/** MA 类指标（SMA/EMA）信号生成 */
function generateMaSignals(opts: MaSignalOpts): boolean[] {
  const { indicator, prices, dates, param1, param2, rebalanceFrequency } = opts;
  const ma = indicator === 'sma' ? calcSMA(prices, param1) : calcEMA(prices, param1);
  const threshold = param2 / 100;
  const signals: boolean[] = new Array(prices.length).fill(false);
  let inPosition = false;
  let prevDate: string | null = null;

  for (let i = 0; i < prices.length; i++) {
    const canRebalance = shouldRebalance({
      frequency: rebalanceFrequency,
      currentDate: dates[i],
      prevDate,
    });
    if (ma[i] == null) {
      signals[i] = inPosition;
      prevDate = dates[i];
      continue;
    }
    const maVal = ma[i] as number;
    const upperBand = maVal * (1 + threshold);
    const lowerBand = maVal * (1 - threshold);
    if (canRebalance) {
      if (!inPosition && prices[i] > upperBand) inPosition = true;
      else if (inPosition && prices[i] < lowerBand) inPosition = false;
    }
    signals[i] = inPosition;
    prevDate = dates[i];
  }
  return signals;
}

/** RSI 指标信号生成 */
function generateRsiSignals(
  prices: number[],
  dates: string[],
  param1: number,
  param2: number,
  rebalanceFrequency: RebalanceFrequency,
): boolean[] {
  const rsi = calcRSI(prices, param1);
  const oversold = param2;
  const overbought = 100 - param2;
  const signals: boolean[] = new Array(prices.length).fill(false);
  let inPosition = false;
  let prevDate: string | null = null;

  for (let i = 0; i < prices.length; i++) {
    const canRebalance = shouldRebalance({
      frequency: rebalanceFrequency,
      currentDate: dates[i],
      prevDate,
    });
    if (rsi[i] == null) {
      signals[i] = inPosition;
      prevDate = dates[i];
      continue;
    }
    const rsiVal = rsi[i] as number;
    if (canRebalance) {
      if (!inPosition && rsiVal < oversold) inPosition = true;
      else if (inPosition && rsiVal > overbought) inPosition = false;
    }
    signals[i] = inPosition;
    prevDate = dates[i];
  }
  return signals;
}

export function generateSignals(
  indicator: IndicatorType,
  prices: number[],
  dates: string[],
  signalParams: SignalParams,
): boolean[] {
  const { param1, param2, rebalanceFrequency } = signalParams;
  if (indicator === 'sma' || indicator === 'ema') {
    return generateMaSignals({ indicator, prices, dates, param1, param2, rebalanceFrequency });
  }
  if (indicator === 'rsi') {
    return generateRsiSignals(prices, dates, param1, param2, rebalanceFrequency);
  }
  return new Array(prices.length).fill(false);
}

/**
 * 根据信号构建合成价格序列
 * 信号为 true 时跟随实际收益，false 时持有现金（收益为 0）
 */
export function buildSyntheticPrices(
  dates: string[],
  prices: number[],
  signals: boolean[],
): Record<string, number> {
  const synthetic: Record<string, number> = {};
  if (dates.length === 0) return synthetic;

  synthetic[dates[0]] = prices[0];
  let prevSynthetic = prices[0];

  for (let i = 1; i < dates.length; i++) {
    const actualReturn = prices[i - 1] > 0 ? prices[i] / prices[i - 1] - 1 : 0;
    const dailyReturn = signals[i] ? actualReturn : 0;
    prevSynthetic = prevSynthetic * (1 + dailyReturn);
    synthetic[dates[i]] = prevSynthetic;
  }

  return synthetic;
}

/** 从 Statistics 提取关键指标 */
export function extractMetrics(
  stats: Statistics,
): Omit<GridCombinationMetrics, 'param1' | 'param2'> {
  return {
    cagr: stats.cagr || 0,
    maxDrawdown: stats.maxDrawdown || 0,
    sharpe: stats.sharpe || 0,
    totalReturn: stats.totalReturn || 0,
    stdev: stats.stdev || 0,
    calmar: stats.calmar || 0,
  };
}

/** 根据优化目标获取排序值（越大越优） */
export function getObjectiveValue(
  metrics: GridCombinationMetrics,
  objective: ObjectiveType,
): number {
  switch (objective) {
    case 'maxCAGR':
      return metrics.cagr;
    case 'minDrawdown':
      return -metrics.maxDrawdown; // 回撤越小越优
    case 'maxSharpe':
      return metrics.sharpe;
    default:
      return metrics.cagr;
  }
}

/**
 * 执行网格搜索主函数
 *
 * 遍历参数网格（笛卡尔积），对每个参数组合计算信号并运行回测，
 * 按优化目标排序返回结果与热力图数据矩阵。
 */
/** 单组合回测的输入参数 */
interface SingleCombinationOpts {
  p1: number;
  p2: number;
  indicator: IndicatorType;
  prices: number[];
  dates: string[];
  tradingTicker: string;
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: RebalanceFrequency;
}

/** 构建网格回测用的组合与参数对象 */
function buildGridPortfolioAndParams(opts: SingleCombinationOpts) {
  const { p1, p2, tradingTicker, startDate, endDate, startingValue } = opts;
  const portfolio: Portfolio = {
    id: `grid-${p1}-${p2}`,
    name: `p1=${p1}, p2=${p2}`,
    assets: [{ ticker: tradingTicker, weight: 100 }],
    rebalanceFrequency: 'none',
  };
  const btParams = {
    startDate,
    endDate,
    startingValue,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: '',
    cashflowLegs: [],
    oneTimeCashflows: [],
  };
  return { portfolio, btParams };
}

/** 运行单个参数组合的回测 */
function runSingleCombination(opts: SingleCombinationOpts): {
  metrics: GridCombinationMetrics;
  result: TopCombinationResult;
} {
  const { p1, p2, indicator, prices, dates, tradingTicker, rebalanceFrequency } = opts;
  const signals = generateSignals(indicator, prices, dates, {
    param1: p1,
    param2: p2,
    rebalanceFrequency,
  });
  const syntheticPrices = buildSyntheticPrices(dates, prices, signals);
  const syntheticPriceData = { [tradingTicker]: syntheticPrices };
  const { portfolio, btParams } = buildGridPortfolioAndParams(opts);

  try {
    const btResult = runPortfolioBacktest([portfolio], syntheticPriceData, btParams);
    const portfolioResult = btResult.portfolios[0];
    const metrics = extractMetrics(portfolioResult.statistics);
    return {
      metrics: { param1: p1, param2: p2, ...metrics },
      result: { param1: p1, param2: p2, ...metrics, growthCurve: portfolioResult.growthCurve },
    };
  } catch {
    const fallback: GridCombinationMetrics = {
      param1: p1,
      param2: p2,
      cagr: 0,
      maxDrawdown: 0,
      sharpe: 0,
      totalReturn: 0,
      stdev: 0,
      calmar: 0,
    };
    return { metrics: fallback, result: { ...fallback, growthCurve: [] } };
  }
}

/** 构建热力图矩阵 */
function buildHeatmapMatrix(
  param1Values: number[],
  param2Values: number[],
  allResults: TopCombinationResult[],
  objective: ObjectiveType,
): (number | null)[][] {
  const matrix: (number | null)[][] = [];
  for (const p1 of param1Values) {
    const row: (number | null)[] = [];
    for (const p2 of param2Values) {
      const result = allResults.find((r) => r.param1 === p1 && r.param2 === p2);
      row.push(result ? getObjectiveValue(result, objective) : null);
    }
    matrix.push(row);
  }
  return matrix;
}

export function runGridSearch(
  request: TacticalGridRequest,
  _priceData: Record<string, Record<string, number>>,
  dates: string[],
  prices: number[],
  tradingTicker: string,
): TacticalGridResponse {
  const {
    indicator,
    param1: param1Range,
    param2: param2Range,
    startDate,
    endDate,
    startingValue,
    rebalanceFrequency,
    objective,
    topN = 10,
  } = request;

  const param1Values = generateRange(param1Range.min, param1Range.max, param1Range.step);
  const param2Values = generateRange(param2Range.min, param2Range.max, param2Range.step);
  const totalCombinations = param1Values.length * param2Values.length;

  const allMetrics: GridCombinationMetrics[] = [];
  const allResultsWithCurve: TopCombinationResult[] = [];

  for (const p1 of param1Values) {
    for (const p2 of param2Values) {
      const { metrics, result } = runSingleCombination({
        p1,
        p2,
        indicator,
        prices,
        dates,
        tradingTicker,
        startDate,
        endDate,
        startingValue,
        rebalanceFrequency,
      });
      allMetrics.push(metrics);
      allResultsWithCurve.push(result);
    }
  }

  allMetrics.sort((a, b) => getObjectiveValue(b, objective) - getObjectiveValue(a, objective));
  allResultsWithCurve.sort(
    (a, b) => getObjectiveValue(b, objective) - getObjectiveValue(a, objective),
  );

  const topResults = allResultsWithCurve.slice(0, Math.min(topN, allResultsWithCurve.length));

  const param1Label = indicator === 'rsi' ? 'RSI 周期' : `${indicator.toUpperCase()} 周期`;
  const param2Label = indicator === 'rsi' ? '超卖阈值' : '突破阈值(%)';
  const matrix = buildHeatmapMatrix(param1Values, param2Values, allResultsWithCurve, objective);
  const bestCombination = topResults[0];

  return {
    totalCombinations,
    allMetrics,
    topResults,
    heatmap: {
      param1Label,
      param2Label,
      param1Values,
      param2Values,
      matrix,
      objective,
    },
    bestCombination,
  };
}
