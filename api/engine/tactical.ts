/**
 * 战术分配（Tactical Allocation）核心算法
 *
 * Architecture: 战术分配计算逻辑，从路由文件外迁
 * 企业为何需要：业务逻辑与HTTP处理耦合导致无法单元测试、无法复用
 * 权衡：增加一层间接调用，但可测试性和可维护性大幅提升
 *
 * 信号计算流程：
 *   1. 根据技术指标（SMA/EMA/RSI/MACD/Bollinger/Momentum）计算指标值序列
 *   2. 按信号条件（gt/lt/cross_above/cross_below）评估每个信号在各日期是否激活
 *   3. 聚合多信号（加权平均/排名/投票）生成各日期的目标权重
 *   4. 按再平衡频率切换权重，运行动态回测
 */

import type {
  TacticalStrategy,
  SignalCondition,
  TechnicalIndicator,
  WhatIfResult,
} from '../../shared/types/tactical.js';
import type { RebalanceFrequency, PortfolioResult, Statistics } from '../../shared/types/index.js';
import { createEmptyStatistics } from '../../shared/types/index.js';
import {
  calcSMA,
  calcEMA,
  calcRSI,
  calcMACD,
  calcBollingerPctB,
  calcMomentum,
} from '../services/indicatorService.js';
import { shouldRebalance } from './rebalance.js';
import { calcMaxDrawdown as calcMaxDrawdownStats, calcCalmar } from './statistics.js';
import { TRADING_DAYS_PER_YEAR } from '../../shared/constants.js';

// ===== 类型定义 =====

export interface BacktestRequest {
  strategy: TacticalStrategy;
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: RebalanceFrequency;
}

export interface BacktestResponseData {
  portfolio: PortfolioResult;
  benchmark: PortfolioResult;
  signalHistory: Array<{
    date: string;
    activeSignals: string[];
    weights: Array<{ ticker: string; weight: number }>;
  }>;
}

export interface WhatIfRequest {
  tickers: string[];
  strategy: TacticalStrategy;
  endDate?: string;
}

// ===== 技术指标计算 =====
// 技术指标计算逻辑（SMA/EMA/RSI/MACD/Bollinger/Momentum）已统一移至 services/indicatorService.ts
// 指标值约定（用于与 threshold 比较）：
//   sma/ema   : (price - MA) / MA          价格相对均线偏离比率，0 = 处于均线
//   rsi       : RSI 原值 (0-100)            70 = 超买，30 = 超卖
//   macd      : MACD 柱（MACD - Signal）    0 = 多空分界
//   bollinger : %B = (price-lower)/(upper-lower)  0=下轨 1=上轨 0.5=中轨
//   momentum  : (price/price_n_ago - 1)*100 百分比收益，0 = 无变化

/**
 * 计算指标值（适配战术路由的返回格式）
 * 底层调用 indicatorService 的统一实现，将 NaN 转换为 null 以保持向后兼容。
 */
export function computeIndicatorValue(
  indicator: TechnicalIndicator,
  prices: number[],
  period: number,
): (number | null)[] {
  let result: number[];
  switch (indicator) {
    case 'sma': {
      const sma = calcSMA(prices, period);
      result = prices.map((p, i) => (!isNaN(sma[i]) && sma[i] !== 0 ? (p - sma[i]) / sma[i] : NaN));
      break;
    }
    case 'ema': {
      const ema = calcEMA(prices, period);
      result = prices.map((p, i) => (!isNaN(ema[i]) && ema[i] !== 0 ? (p - ema[i]) / ema[i] : NaN));
      break;
    }
    case 'rsi':
      result = calcRSI(prices, period);
      break;
    case 'macd':
      result = calcMACD(prices).histogram;
      break;
    case 'bollinger':
      result = calcBollingerPctB(prices, period);
      break;
    case 'momentum':
      result = calcMomentum(prices, period);
      break;
    default:
      result = new Array(prices.length).fill(NaN);
  }
  // 将 NaN 转换为 null 以保持向后兼容
  return result.map((val) => (isNaN(val) ? null : val));
}

// ===== 信号评估 =====

export function evaluateCondition(
  condition: SignalCondition,
  values: (number | null)[],
): boolean[] {
  const { operator, threshold } = condition;
  return values.map((val, i) => {
    if (val == null) return false;
    const prev = i > 0 ? values[i - 1] : null;
    switch (operator) {
      case 'gt':
        return val > threshold;
      case 'lt':
        return val < threshold;
      case 'cross_above':
        return val > threshold && prev != null && prev <= threshold;
      case 'cross_below':
        return val < threshold && prev != null && prev >= threshold;
      default:
        return false;
    }
  });
}

export function collectTickers(strategy: TacticalStrategy): string[] {
  const set = new Set<string>();
  for (const signal of strategy.signals) {
    for (const w of signal.targetWeights) set.add(w.ticker);
  }
  return Array.from(set);
}

export function normalizeWeights(
  weights: Array<{ ticker: string; weight: number }>,
  tickers: string[],
): Array<{ ticker: string; weight: number }> {
  const map = new Map<string, number>();
  for (const w of weights) map.set(w.ticker, w.weight);
  for (const t of tickers) if (!map.has(t)) map.set(t, 0);
  let total = 0;
  for (const v of map.values()) total += v;
  if (total <= 0) {
    return tickers.map((t) => ({ ticker: t, weight: 1 / tickers.length }));
  }
  return tickers.map((t) => ({ ticker: t, weight: (map.get(t) as number) / total }));
}

/**
 * 聚合多信号生成单日目标权重
 * - weighted_average: 激活信号目标权重等权平均
 * - rank: 按累计权重排名取 TopN
 * - voting: 取第一个激活信号的目标权重
 */
/** weighted_average 聚合 */
function aggregateWeightedAverage(
  activeSignals: TacticalStrategy['signals'],
  allTickers: string[],
): Array<{ ticker: string; weight: number }> {
  const acc = new Map<string, number>();
  for (const t of allTickers) acc.set(t, 0);
  for (const sig of activeSignals) {
    const norm = normalizeWeights(sig.targetWeights, allTickers);
    for (const w of norm) acc.set(w.ticker, (acc.get(w.ticker) as number) + w.weight);
  }
  let total = 0;
  for (const v of acc.values()) total += v;
  return total > 0
    ? allTickers.map((t) => ({ ticker: t, weight: (acc.get(t) as number) / total }))
    : allTickers.map((t) => ({ ticker: t, weight: 1 / allTickers.length }));
}

/** rank 聚合 */
function aggregateRank(
  activeSignals: TacticalStrategy['signals'],
  allTickers: string[],
  rankingConfig: TacticalStrategy['rankingConfig'],
): Array<{ ticker: string; weight: number }> {
  const topN = Math.max(1, rankingConfig?.topN ?? 3);
  const method = rankingConfig?.method ?? 'fixed_share';
  const score = new Map<string, number>();
  for (const t of allTickers) score.set(t, 0);
  for (const sig of activeSignals) {
    const norm = normalizeWeights(sig.targetWeights, allTickers);
    for (const w of norm) score.set(w.ticker, (score.get(w.ticker) as number) + w.weight);
  }
  const ranked = allTickers
    .map((t) => ({ ticker: t, score: score.get(t) as number }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
  if (method === 'risk_parity') {
    const inv = ranked.map((r) => (r.score > 0 ? 1 / r.score : 1));
    const sumInv = inv.reduce((s, v) => s + v, 0);
    return ranked.map((r, i) => ({ ticker: r.ticker, weight: inv[i] / sumInv }));
  }
  return ranked.map((r) => ({ ticker: r.ticker, weight: 1 / ranked.length }));
}

export function aggregateSignals(
  strategy: TacticalStrategy,
  activeFlags: Map<string, boolean[]>,
  dateIdx: number,
  allTickers: string[],
): Array<{ ticker: string; weight: number }> {
  const activeSignals = strategy.signals.filter((s) => activeFlags.get(s.id)?.[dateIdx] === true);

  if (activeSignals.length === 0) {
    return allTickers.map((t) => ({ ticker: t, weight: 1 / allTickers.length }));
  }

  if (strategy.aggregationMethod === 'weighted_average') {
    return aggregateWeightedAverage(activeSignals, allTickers);
  }
  if (strategy.aggregationMethod === 'rank') {
    return aggregateRank(activeSignals, allTickers, strategy.rankingConfig);
  }
  // voting 或 default
  return normalizeWeights(activeSignals[0].targetWeights, allTickers);
}

// ===== 战术回测（动态权重） =====

/** 计算所有信号的激活标志 */
function computeActiveFlags(
  strategy: TacticalStrategy,
  priceData: Record<string, Record<string, number>>,
  dates: string[],
  allTickers: string[],
): Map<string, boolean[]> {
  const activeFlags = new Map<string, boolean[]>();
  for (const signal of strategy.signals) {
    const signalTicker =
      [...signal.targetWeights].sort((a, b) => b.weight - a.weight)[0]?.ticker || allTickers[0];
    const priceMap = priceData[signalTicker] || {};
    let lastValid = 0;
    const filledPrices: number[] = dates.map((d) => {
      const p = priceMap[d];
      if (p != null) lastValid = p;
      return lastValid;
    });
    const conditionFlags: boolean[][] = signal.conditions.map((cond) => {
      const values = computeIndicatorValue(cond.indicator, filledPrices, cond.period);
      return evaluateCondition(cond, values);
    });
    const combined: boolean[] = dates.map((_, i) => conditionFlags.every((f) => f[i] === true));
    activeFlags.set(signal.id, combined);
  }
  return activeFlags;
}

/** 更新单日持仓价值 */
function updateHoldingsValue(
  holdings: Record<string, number>,
  allTickers: string[],
  priceData: Record<string, Record<string, number>>,
  date: string,
  prevDate: string | null,
): number {
  let total = 0;
  for (const ticker of allTickers) {
    const priceToday = priceData[ticker]?.[date];
    const pricePrev = prevDate ? priceData[ticker]?.[prevDate] : null;
    if (priceToday != null && pricePrev != null && pricePrev > 0) {
      holdings[ticker] = (holdings[ticker] || 0) * (priceToday / pricePrev);
    }
    total += holdings[ticker] || 0;
  }
  return total;
}

export function runTacticalBacktest(
  strategy: TacticalStrategy,
  priceData: Record<string, Record<string, number>>,
  dates: string[],
  startingValue: number,
  rebalanceFrequency: RebalanceFrequency,
): { result: PortfolioResult; signalHistory: BacktestResponseData['signalHistory'] } {
  const allTickers = collectTickers(strategy);
  const activeFlags = computeActiveFlags(strategy, priceData, dates, allTickers);

  const growthCurve: Array<{ date: string; value: number }> = [];
  const signalHistory: BacktestResponseData['signalHistory'] = [];
  let portfolioValue = startingValue;
  const holdings: Record<string, number> = {};
  let currentWeights: Array<{ ticker: string; weight: number }> = allTickers.map((t) => ({
    ticker: t,
    weight: 1 / allTickers.length,
  }));
  for (const w of currentWeights) holdings[w.ticker] = portfolioValue * w.weight;
  let prevDate: string | null = null;
  let initialized = false;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];

    if (initialized) {
      portfolioValue = updateHoldingsValue(holdings, allTickers, priceData, date, prevDate);
    }

    if (portfolioValue <= 0) {
      portfolioValue = 0;
      for (const t of allTickers) holdings[t] = 0;
      growthCurve.push({ date, value: 0 });
      prevDate = date;
      initialized = true;
      continue;
    }

    // 再平衡：切换到信号聚合后的目标权重
    if (
      !initialized ||
      shouldRebalance({ frequency: rebalanceFrequency, currentDate: date, prevDate })
    ) {
      currentWeights = aggregateSignals(strategy, activeFlags, i, allTickers);
      for (const w of currentWeights) holdings[w.ticker] = portfolioValue * w.weight;

      const activeSignalNames = strategy.signals
        .filter((s) => activeFlags.get(s.id)?.[i] === true)
        .map((s) => s.name);
      signalHistory.push({
        date,
        activeSignals: activeSignalNames,
        weights: currentWeights.map((w) => ({ ticker: w.ticker, weight: +w.weight.toFixed(4) })),
      });
    }

    growthCurve.push({ date, value: portfolioValue });
    prevDate = date;
    initialized = true;
  }

  const statistics = computeSimpleStatistics(growthCurve, startingValue);

  const result: PortfolioResult = {
    name: '战术分配',
    growthCurve,
    drawdownCurve: [],
    rollingReturns: [],
    annualReturns: [],
    monthlyReturns: [],
    statistics,
  };

  return { result, signalHistory };
}

/** 从增长曲线计算日收益率和基本统计 */
function calcDailyReturnStats(values: number[]): {
  dailyReturns: number[];
  mean: number;
  stdev: number;
} {
  const dailyReturns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) dailyReturns.push((values[i] - values[i - 1]) / values[i - 1]);
  }
  const n = dailyReturns.length;
  const mean = n > 0 ? dailyReturns.reduce((s, v) => s + v, 0) / n : 0;
  const variance = n > 1 ? dailyReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const stdev = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  return { dailyReturns, mean, stdev };
}

export function computeSimpleStatistics(
  growthCurve: Array<{ date: string; value: number }>,
  startingValue: number,
): Statistics {
  const empty: Statistics = createEmptyStatistics();
  if (growthCurve.length < 2) return empty;

  const values = growthCurve.map((g) => g.value);
  const finalValue = values[values.length - 1];
  const years = values.length / TRADING_DAYS_PER_YEAR;
  const cagr =
    finalValue > 0 && years > 0 ? Math.pow(finalValue / startingValue, 1 / years) - 1 : -1;
  const totalReturn = startingValue > 0 ? finalValue / startingValue - 1 : 0;

  const { dailyReturns, stdev } = calcDailyReturnStats(values);
  const n = dailyReturns.length;
  const sharpe = stdev > 0 ? cagr / stdev : 0;

  const maxDrawdown = calcMaxDrawdownStats(values).maxDrawdown;
  const calmar = calcCalmar(cagr, maxDrawdown);
  const pctPositiveDays = n > 0 ? dailyReturns.filter((r) => r > 0).length / n : 0;

  return {
    ...empty,
    cagr,
    stdev,
    sharpe,
    maxDrawdown,
    calmar,
    totalReturn,
    pctPositiveDays,
    maxDailyReturn: n > 0 ? Math.max(...dailyReturns) : 0,
    minDailyReturn: n > 0 ? Math.min(...dailyReturns) : 0,
  };
}

/**
 * 执行 What-If 实时信号分析
 */
export function analyzeWhatIf(
  tickers: string[],
  strategy: TacticalStrategy,
  priceData: Record<string, Record<string, number>>,
  endDate: string,
): WhatIfResult[] {
  return tickers.map((ticker) => {
    const priceMap = priceData[ticker] || {};
    const dates = Object.keys(priceMap).sort();
    if (dates.length === 0) {
      return { ticker, currentPrice: 0, signalDate: endDate, signalType: 'hold' as const };
    }
    const lastDate = dates[dates.length - 1];
    const currentPrice = priceMap[lastDate];

    let signalType: 'buy' | 'sell' | 'hold' = 'hold';
    const prices = dates.map((d) => priceMap[d]);
    let buyCount = 0;
    let sellCount = 0;
    for (const signal of strategy?.signals || []) {
      for (const cond of signal.conditions) {
        const values = computeIndicatorValue(cond.indicator, prices, cond.period);
        const flags = evaluateCondition(cond, values);
        const lastFlag = flags[flags.length - 1];
        if (lastFlag) {
          if (cond.operator === 'gt' || cond.operator === 'cross_above') buyCount++;
          else if (cond.operator === 'lt' || cond.operator === 'cross_below') sellCount++;
        }
      }
    }
    if (buyCount > sellCount) signalType = 'buy';
    else if (sellCount > buyCount) signalType = 'sell';

    return { ticker, currentPrice, signalDate: lastDate, signalType };
  });
}
