/**
 * 信号分析核心算法
 *
 * Architecture: 信号生成逻辑，从路由文件外迁
 * 企业为何需要：业务逻辑与HTTP处理耦合导致无法单元测试、无法复用
 * 权衡：增加一层间接调用，但可测试性和可维护性大幅提升
 *
 * 信号计算逻辑（共享）：
 * - 根据技术指标计算信号（SMA/EMA 交叉、RSI 超买超卖、MACD 交叉、Bollinger 突破）
 * - 生成买卖信号点
 * - 计算信号统计（胜率、平均收益、最大回撤、夏普）
 * - 模拟仅做多权益曲线
 */

import {
  calcSMA,
  calcEMA,
  calcRSI,
  calcMACD,
  calcBollinger,
} from '../services/indicatorService.js';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import type { SignalAnalysisRequest, SignalAnalysisResult } from '@backtest/shared/types/signal';

// ===== 内部类型 =====

export interface PricePoint {
  date: string;
  price: number;
}

export type SignalDir = 'buy' | 'sell';

export interface SignalPoint {
  date: string;
  type: SignalDir;
  price: number;
}

/** 双信号分析响应 */
export interface DualSignalResult {
  signal1: SignalAnalysisResult;
  signal2: SignalAnalysisResult;
  combined: SignalAnalysisResult;
  comparison: Array<{
    date: string;
    signal1: SignalDir | null;
    signal2: SignalDir | null;
    combined: SignalDir | null;
  }>;
}

/** 多信号分析响应 */
export interface MultiSignalResult {
  aggregated: SignalAnalysisResult;
  contributions: Array<{
    index: number;
    indicator: string;
    contribution: number;
    statistics: SignalAnalysisResult['statistics'];
  }>;
}

/** 权益曲线初始资金 */
const INITIAL_CAPITAL = 10000;

/** 通用信号生成循环 */
function generateSignals(
  data: PricePoint[],
  prices: number[],
  isValid: (i: number) => boolean,
  getSignal: (i: number) => { type: SignalDir; price: number } | null,
): SignalPoint[] {
  const signals: SignalPoint[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (!isValid(i)) continue;
    const result = getSignal(i);
    if (result) {
      signals.push({ date: data[i].date, type: result.type, price: result.price });
    }
  }
  return signals;
}

// ===== 信号生成 =====

/**
 * 根据技术指标生成原始买卖信号（未按 signalType 过滤）。
 *
 * threshold 含义随指标变化：
 * - RSI：超卖阈值（买入触发），超买阈值 = 100 - threshold
 * - Bollinger：标准差倍数（默认 2）
 * - SMA/EMA/MACD：交叉触发，threshold 不参与计算
 */
/** 检测交叉信号：prev 前一帧、cur 当前帧，上穿生成 buy，下穿生成 sell */
function detectCrossSignals(
  data: PricePoint[],
  prevVals: number[],
  curVals: number[],
  prices: number[],
): SignalPoint[] {
  const signals: SignalPoint[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (isNaN(curVals[i]) || isNaN(prevVals[i]) || isNaN(curVals[i - 1]) || isNaN(prevVals[i - 1]))
      continue;
    const crossedUp = prevVals[i - 1] <= curVals[i - 1] && prevVals[i] > curVals[i];
    const crossedDown = prevVals[i - 1] >= curVals[i - 1] && prevVals[i] < curVals[i];
    if (crossedUp) {
      signals.push({ date: data[i].date, type: 'buy', price: prices[i] });
    } else if (crossedDown) {
      signals.push({ date: data[i].date, type: 'sell', price: prices[i] });
    }
  }
  return signals;
}

/** 生成 MA（SMA/EMA）交叉信号 */
function generateMaSignals(
  ind: string,
  prices: number[],
  data: PricePoint[],
  safePeriod: number,
): SignalPoint[] {
  const ma = ind === 'sma' ? calcSMA(prices, safePeriod) : calcEMA(prices, safePeriod);
  return detectCrossSignals(data, prices, ma, prices);
}

/** 生成 RSI 超买超卖信号 */
function generateRsiSignals(
  prices: number[],
  data: PricePoint[],
  safePeriod: number,
  threshold: number,
): SignalPoint[] {
  const rsi = calcRSI(prices, safePeriod);
  const oversold = threshold > 0 ? threshold : 30;
  const overbought = 100 - oversold;
  return generateSignals(
    data,
    prices,
    (i) => !isNaN(rsi[i]) && !isNaN(rsi[i - 1]),
    (i) => {
      if (rsi[i - 1] >= oversold && rsi[i] < oversold) return { type: 'buy', price: prices[i] };
      if (rsi[i - 1] <= overbought && rsi[i] > overbought)
        return { type: 'sell', price: prices[i] };
      return null;
    },
  );
}

/** 生成 MACD 金叉死叉信号 */
function generateMacdSignals(prices: number[], data: PricePoint[]): SignalPoint[] {
  const { macd, signal } = calcMACD(prices);
  return detectCrossSignals(data, macd, signal, prices);
}

/** 生成布林带突破信号 */
function generateBollingerSignals(
  prices: number[],
  data: PricePoint[],
  safePeriod: number,
  threshold: number,
): SignalPoint[] {
  const mult = threshold > 0 ? threshold : 2;
  const { upper, lower } = calcBollinger(prices, safePeriod, mult);
  return generateSignals(
    data,
    prices,
    (i) => !isNaN(upper[i]) && !isNaN(lower[i]) && !isNaN(upper[i - 1]) && !isNaN(lower[i - 1]),
    (i) => {
      if (prices[i - 1] >= lower[i - 1] && prices[i] < lower[i])
        return { type: 'buy', price: prices[i] };
      if (prices[i - 1] <= upper[i - 1] && prices[i] > upper[i])
        return { type: 'sell', price: prices[i] };
      return null;
    },
  );
}

export function generateRawSignals(
  indicator: string,
  period: number,
  threshold: number,
  data: PricePoint[],
): SignalPoint[] {
  const prices = data.map((d) => d.price);
  if (prices.length < 2) return [];

  const ind = indicator.toLowerCase();
  const safePeriod = Math.max(2, period);

  if (ind === 'sma' || ind === 'ema') return generateMaSignals(ind, prices, data, safePeriod);
  if (ind === 'rsi') return generateRsiSignals(prices, data, safePeriod, threshold);
  if (ind === 'macd') return generateMacdSignals(prices, data);
  if (ind === 'bollinger') return generateBollingerSignals(prices, data, safePeriod, threshold);
  return [];
}

/** 按 signalType 过滤信号（entry=仅买入，exit=仅卖出，both=全部） */
export function filterByType(signals: SignalPoint[], signalType: string): SignalPoint[] {
  if (signalType === 'entry') return signals.filter((s) => s.type === 'buy');
  if (signalType === 'exit') return signals.filter((s) => s.type === 'sell');
  return signals;
}

// ===== 统计与权益曲线 =====

/**
 * 计算信号统计（胜率、平均收益）。
 * 通过配对 buy→sell 计算已完成交易；无配对时胜率与平均收益为 0。
 * maxDrawdown / sharpe 由 calcEquityCurve 回填。
 */
export function calcStatistics(signals: SignalPoint[]): SignalAnalysisResult['statistics'] {
  const totalSignals = signals.length;
  let wins = 0;
  let completedTrades = 0;
  let returnSum = 0;

  let pendingBuy: number | null = null;
  for (const s of signals) {
    if (s.type === 'buy') {
      pendingBuy = s.price;
    } else if (s.type === 'sell' && pendingBuy !== null) {
      const ret = (s.price - pendingBuy) / pendingBuy;
      returnSum += ret;
      completedTrades++;
      if (ret > 0) wins++;
      pendingBuy = null;
    }
  }

  const winRate = completedTrades > 0 ? wins / completedTrades : 0;
  const avgReturn = completedTrades > 0 ? returnSum / completedTrades : 0;

  return { totalSignals, winRate, avgReturn, maxDrawdown: 0, sharpe: 0 };
}

/**
 * 模拟仅做多权益曲线，并回填最大回撤与年化夏普。
 * - 买入信号：满仓入场
 * - 卖出信号：平仓
 * - 无信号时持有现金或持仓不变
 */
/** 计算最大回撤 */
function calcMaxDrawdown(equityCurve: Array<{ date: string; value: number }>): number {
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const p of equityCurve) {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? (peak - p.value) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  return maxDrawdown;
}

/** 计算年化夏普比率 */
function calcSharpe(dailyReturns: number[]): number {
  if (dailyReturns.length <= 1) return 0;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (dailyReturns.length - 1);
  const std = Math.sqrt(variance);
  return std > 0 ? (mean / std) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0;
}

export function calcEquityCurve(
  signals: SignalPoint[],
  data: PricePoint[],
): {
  equityCurve: Array<{ date: string; value: number }>;
  maxDrawdown: number;
  sharpe: number;
} {
  const signalMap = new Map<string, SignalDir>();
  for (const s of signals) signalMap.set(s.date, s.type);

  let capital = INITIAL_CAPITAL;
  let shares = 0;
  let inPosition = false;
  const equityCurve: Array<{ date: string; value: number }> = [];
  const dailyReturns: number[] = [];
  let prevEquity = INITIAL_CAPITAL;

  for (const point of data) {
    const sig = signalMap.get(point.date);
    if (sig === 'buy' && !inPosition) {
      shares = capital / point.price;
      inPosition = true;
    } else if (sig === 'sell' && inPosition) {
      capital = shares * point.price;
      shares = 0;
      inPosition = false;
    }
    const equity = inPosition ? shares * point.price : capital;
    equityCurve.push({ date: point.date, value: +equity.toFixed(2) });
    if (prevEquity > 0) dailyReturns.push((equity - prevEquity) / prevEquity);
    prevEquity = equity;
  }

  return {
    equityCurve,
    maxDrawdown: calcMaxDrawdown(equityCurve),
    sharpe: calcSharpe(dailyReturns),
  };
}

// ===== 主分析函数 =====

/** 执行单信号分析，返回符合 SignalAnalysisResult 的结果 */
export function analyzeSignal(
  req: SignalAnalysisRequest,
  data: PricePoint[],
): SignalAnalysisResult {
  const rawSignals = generateRawSignals(req.indicator, req.period, req.threshold, data);
  const signals = filterByType(rawSignals, req.signalType);
  const stats = calcStatistics(signals);
  const { equityCurve, maxDrawdown, sharpe } = calcEquityCurve(signals, data);
  return {
    signals,
    statistics: { ...stats, maxDrawdown, sharpe },
    equityCurve,
  };
}

// ===== 双信号组合工具 =====

/** 构建日期→信号方向映射 */
export function buildSignalDirMap(signals: SignalPoint[]): Map<string, SignalDir> {
  const map = new Map<string, SignalDir>();
  for (const s of signals) map.set(s.date, s.type);
  return map;
}

/** 按组合方式合并两个信号方向 */
export function combineDir(
  s1: SignalDir | null,
  s2: SignalDir | null,
  method: 'and' | 'or' | 'xor',
): SignalDir | null {
  switch (method) {
    case 'and':
      // 两者同向才触发
      if (s1 && s2 && s1 === s2) return s1;
      return null;
    case 'or':
      // 任一触发即触发
      return s1 ?? s2;
    case 'xor':
      // 恰好一个触发
      if (s1 && !s2) return s1;
      if (s2 && !s1) return s2;
      return null;
  }
}

/**
 * 执行双信号分析
 */
export function analyzeDualSignal(
  cfg1: SignalAnalysisRequest,
  cfg2: SignalAnalysisRequest,
  data1: PricePoint[],
  data2: PricePoint[],
  combinationMethod: 'and' | 'or' | 'xor',
): DualSignalResult {
  const result1 = analyzeSignal(cfg1, data1);
  const result2 = analyzeSignal(cfg2, data2);

  // 按日期对齐并组合信号
  const map1 = buildSignalDirMap(result1.signals);
  const map2 = buildSignalDirMap(result2.signals);
  const allDates = Array.from(new Set([...map1.keys(), ...map2.keys()])).sort();

  const comparison: DualSignalResult['comparison'] = [];
  const combinedSignals: SignalPoint[] = [];
  // 组合权益曲线统一使用 signal1 的价格序列
  const priceMap = new Map(data1.map((d) => [d.date, d.price]));

  for (const date of allDates) {
    const s1 = map1.get(date) ?? null;
    const s2 = map2.get(date) ?? null;
    const combined = combineDir(s1, s2, combinationMethod);
    comparison.push({ date, signal1: s1, signal2: s2, combined });
    if (combined && priceMap.has(date)) {
      combinedSignals.push({ date, type: combined, price: priceMap.get(date)! });
    }
  }

  const combinedStats = calcStatistics(combinedSignals);
  const { equityCurve, maxDrawdown, sharpe } = calcEquityCurve(combinedSignals, data1);
  const combined: SignalAnalysisResult = {
    signals: combinedSignals,
    statistics: { ...combinedStats, maxDrawdown, sharpe },
    equityCurve,
  };

  return {
    signal1: result1,
    signal2: result2,
    combined,
    comparison,
  };
}

/**
 * 执行多信号分析
 */
/** 单日期聚合上下文 */
interface AggregationContext {
  dirMaps: Map<string, SignalDir>[];
  perSignal: SignalAnalysisResult[];
  rawWeights: number[];
  wSum: number;
  configs: SignalAnalysisRequest[];
}

/** 计算单日期各信号的投票/权重/排名得分 */
function computeDateScores(
  date: string,
  ctx: AggregationContext,
): {
  score: number;
  buys: number;
  sells: number;
  bestDir: SignalDir | null;
} {
  let score = 0;
  let buys = 0;
  let sells = 0;
  let bestRank = -1;
  let bestDir: SignalDir | null = null;

  for (let i = 0; i < ctx.configs.length; i++) {
    const dir = ctx.dirMaps[i].get(date) ?? null;
    const winRate = ctx.perSignal[i].statistics.winRate;
    if (dir === 'buy') {
      score += ctx.rawWeights[i] / ctx.wSum;
      buys++;
      if (winRate > bestRank) {
        bestRank = winRate;
        bestDir = 'buy';
      }
    } else if (dir === 'sell') {
      score -= ctx.rawWeights[i] / ctx.wSum;
      sells++;
      if (winRate > bestRank) {
        bestRank = winRate;
        bestDir = 'sell';
      }
    }
  }
  return { score, buys, sells, bestDir };
}

/** 按聚合方法从得分推导信号方向 */
function dirFromScores(
  scores: { score: number; buys: number; sells: number; bestDir: SignalDir | null },
  method: 'weighted' | 'voting' | 'rank',
): SignalDir | null {
  if (method === 'weighted') {
    if (scores.score > 0) return 'buy';
    if (scores.score < 0) return 'sell';
    return null;
  }
  if (method === 'voting') {
    if (scores.buys > scores.sells) return 'buy';
    if (scores.sells > scores.buys) return 'sell';
    return null;
  }
  return scores.bestDir; // rank
}

export function analyzeMultiSignal(
  configs: SignalAnalysisRequest[],
  data: PricePoint[],
  aggregationMethod: 'weighted' | 'voting' | 'rank',
  weights?: number[],
): MultiSignalResult {
  // 计算每个信号
  const perSignal = configs.map((c) => analyzeSignal(c, data));
  const dirMaps = perSignal.map((r) => buildSignalDirMap(r.signals));

  // 收集所有信号日期
  const allDates = new Set<string>();
  for (const m of dirMaps) for (const d of m.keys()) allDates.add(d);

  const priceMap = new Map(data.map((d) => [d.date, d.price]));
  const aggregatedSignals: SignalPoint[] = [];

  // 权重归一化（未提供或数量不匹配时均分）
  const rawWeights =
    weights && weights.length === configs.length
      ? weights.map((x) => (x >= 0 ? x : 0))
      : configs.map(() => 1 / configs.length);
  const wSum = rawWeights.reduce((a, b) => a + b, 0) || 1;

  const ctx: AggregationContext = { dirMaps, perSignal, rawWeights, wSum, configs };

  for (const date of Array.from(allDates).sort()) {
    const scores = computeDateScores(date, ctx);
    const aggDir = dirFromScores(scores, aggregationMethod);
    if (aggDir && priceMap.has(date)) {
      aggregatedSignals.push({ date, type: aggDir, price: priceMap.get(date)! });
    }
  }

  const aggStats = calcStatistics(aggregatedSignals);
  const { equityCurve, maxDrawdown, sharpe } = calcEquityCurve(aggregatedSignals, data);
  const aggregated: SignalAnalysisResult = {
    signals: aggregatedSignals,
    statistics: { ...aggStats, maxDrawdown, sharpe },
    equityCurve,
  };

  const contributions: MultiSignalResult['contributions'] = perSignal.map((r, i) => ({
    index: i,
    indicator: configs[i].indicator,
    contribution: r.statistics.avgReturn,
    statistics: r.statistics,
  }));

  return { aggregated, contributions };
}
