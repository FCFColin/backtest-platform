/**
 * 蒙特卡洛模拟模块（Node.js降级后备）
 * 主引擎为 Go(engine-go, localhost:5004)；本文件作为一致性参照保留，不用于线上降级（ADR-031）。
 * 对应 Go 实现: engine-go/internal/engine/montecarlo.go
 */

import type {
  Portfolio,
  BacktestParameters,
  MonteCarloResult,
  PerPathMetrics,
} from '../../shared/types.js';
import type { PriceData } from './portfolio.js';
import { getDateLimits } from '../utils/dateUtils.js';
import { calcCAGR, calcAnnualizedStdev, calcMaxDrawdown as calcMaxDrawdownStats } from './statistics.js';
import { TRADING_DAYS_PER_YEAR } from '../../shared/constants.js';

interface MonteCarloParams {
  numSimulations: number;
  numYears: number;
  minBlockYears: number;
  maxBlockYears: number;
  withReplacement: boolean;
  blockSize: number;
  successThreshold: number;
}

const DEFAULT_MC_PARAMS: MonteCarloParams = {
  numSimulations: 1000,
  numYears: 20,
  minBlockYears: 1,
  maxBlockYears: 5,
  withReplacement: true,
  blockSize: 5,
  successThreshold: 1.0,
};

/**
 * 运行蒙特卡洛模拟
 */
export function runMonteCarlo(
  portfolio: Portfolio,
  priceData: PriceData,
  params: BacktestParameters,
  mcParams?: Partial<MonteCarloParams>,
): MonteCarloResult {
  const config = { ...DEFAULT_MC_PARAMS, ...mcParams };
  const {
    numSimulations,
    numYears,
    minBlockYears,
    maxBlockYears,
    withReplacement,
    successThreshold,
  } = config;

  // 获取组合历史日收益率
  const dailyReturns = getPortfolioDailyReturns(portfolio, priceData, params);

  // 计算区块天数范围（将年转为交易日）
  const minBlockDays = minBlockYears * TRADING_DAYS_PER_YEAR;
  const maxBlockDays = maxBlockYears * TRADING_DAYS_PER_YEAR;

  if (dailyReturns.length < minBlockDays) {
    return createEmptyResponse(numYears);
  }

  // 模拟路径数量
  const totalDays = Math.round(numYears * TRADING_DAYS_PER_YEAR);

  // 生成 N 条模拟路径
  const paths: number[][] = [];
  for (let s = 0; s < numSimulations; s++) {
    const path = simulatePath(dailyReturns, totalDays, minBlockDays, maxBlockDays, withReplacement);
    paths.push(path);
  }

  // 计算百分位路径
  const percentiles = calcPercentiles(paths, totalDays);

  // 计算成功概率（每个时间点，组合价值超过阈值的比例）
  const successProbability = calcSuccessProbability(paths, successThreshold);

  // 最终价值分布
  const finalValues = paths.map((p) => p[p.length - 1]);
  const finalDistribution = createHistogram(finalValues, 50);

  // 统计
  const sortedFinal = [...finalValues].sort((a, b) => a - b);
  const mid = Math.floor(sortedFinal.length / 2);
  const medianFinalValue =
    sortedFinal.length % 2 === 0 ? (sortedFinal[mid - 1] + sortedFinal[mid]) / 2 : sortedFinal[mid];
  const meanFinalValue = finalValues.reduce((s, v) => s + v, 0) / finalValues.length;
  const successCount = finalValues.filter((v) => v >= successThreshold).length;
  const successRate = successCount / finalValues.length;

  // 每条路径的指标
  const perPathMetrics = paths.map((p) => calcPathMetrics(p, numYears));

  // 代表性路径（按终值排序，选择5条，降采样为月度）
  const indexedFinals = finalValues.map((v, i) => ({ idx: i, val: v }));
  indexedFinals.sort((a, b) => a.val - b.val);
  const n = indexedFinals.length;

  const pick = (frac: number): number[] => {
    const idx = Math.min(Math.floor(n * frac), n - 1);
    return downsampleMonthly(paths[indexedFinals[idx].idx]);
  };

  const representativePaths = {
    worst: pick(0),
    p25: pick(0.25),
    median: pick(0.5),
    p75: pick(0.75),
    best: pick(1 - 1 / n),
  };

  // 三种成功概率
  const successProbabilities = calcSuccessProbabilities(paths, numYears);

  return {
    percentiles,
    successProbability,
    finalDistribution,
    statistics: {
      medianFinalValue,
      meanFinalValue,
      successRate,
    },
    perPathMetrics,
    representativePaths,
    successProbabilities,
  };
}

/**
 * 获取组合日收益率序列
 */
/** 收集所有标的在日期范围内的交易日 */
function collectTradingDates(
  tickers: string[],
  priceData: PriceData,
  startLimit: string,
  endLimit: string,
): string[] {
  const dateSet = new Set<string>();
  for (const ticker of tickers) {
    if (priceData[ticker]) {
      for (const date of Object.keys(priceData[ticker])) {
        if (date >= startLimit && date <= endLimit) {
          dateSet.add(date);
        }
      }
    }
  }
  return Array.from(dateSet).sort();
}

function getPortfolioDailyReturns(
  portfolio: Portfolio,
  priceData: PriceData,
  params: BacktestParameters,
): number[] {
  const tickers = portfolio.assets.map((a) => a.ticker);
  const weights = portfolio.assets.map((a) => a.weight);

  const { startLimit, endLimit } = getDateLimits(params.startDate, params.endDate);
  const dates = collectTradingDates(tickers, priceData, startLimit, endLimit);

  if (dates.length < 2) return [];

  const dailyReturns: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    let portfolioReturn = 0;
    for (let j = 0; j < tickers.length; j++) {
      const prevPrice = priceData[tickers[j]]?.[dates[i - 1]];
      const currPrice = priceData[tickers[j]]?.[dates[i]];
      if (prevPrice && currPrice && prevPrice > 0) {
        const assetReturn = (currPrice - prevPrice) / prevPrice;
        portfolioReturn += weights[j] * assetReturn;
      }
    }
    dailyReturns.push(portfolioReturn);
  }

  return dailyReturns;
}

/**
 * 区块自举法模拟一条路径（支持变长区块）
 */
/** 无放回采样：从尚未使用的起始位置中选取 */
function pickStartIdxNoReplacement(usedStarts: Set<number>, maxStart: number): number {
  if (usedStarts.size >= maxStart + 1) {
    usedStarts.clear();
  }
  let startIdx: number;
  do {
    startIdx = Math.floor(Math.random() * (maxStart + 1));
  } while (usedStarts.has(startIdx));
  usedStarts.add(startIdx);
  return startIdx;
}

function simulatePath(
  historicalReturns: number[],
  totalDays: number,
  minBlockDays: number,
  maxBlockDays: number,
  withReplacement: boolean,
): number[] {
  const path: number[] = [1.0];
  const n = historicalReturns.length;
  const usedStarts = new Set<number>();

  for (let day = 0; day < totalDays;) {
    const blockSize =
      maxBlockDays > minBlockDays
        ? minBlockDays + Math.floor(Math.random() * (maxBlockDays - minBlockDays + 1))
        : minBlockDays;

    let startIdx: number;
    if (withReplacement) {
      startIdx = Math.floor(Math.random() * n);
    } else {
      const maxStart = n - blockSize;
      startIdx = pickStartIdxNoReplacement(usedStarts, maxStart);
    }

    for (let b = 0; b < blockSize && day < totalDays; b++) {
      const idx = startIdx + b;
      if (idx >= n) break;
      const lastValue = path[path.length - 1];
      path.push(lastValue * (1 + historicalReturns[idx]));
      day++;
    }
  }

  return path;
}

/** 计算 Sortino 比率 */
function calcSortino(dailyReturns: number[]): number {
  const n = dailyReturns.length;
  if (n <= 1) return 0;
  const meanRet = dailyReturns.reduce((s, r) => s + r, 0) / n;
  const downside = dailyReturns.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / n;
  const downsideDev = Math.sqrt(downside) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  return downsideDev > 0 ? (meanRet * TRADING_DAYS_PER_YEAR) / downsideDev : 0;
}

function calcPathMetrics(path: number[], numYears: number): PerPathMetrics {
  const finalValue = path[path.length - 1] || 1.0;
  const cagr = calcCAGR(1, finalValue, numYears);

  const dailyReturns: number[] = [];
  for (let i = 1; i < path.length; i++) {
    if (path[i - 1] > 0) {
      dailyReturns.push((path[i] - path[i - 1]) / path[i - 1]);
    }
  }

  const maxDrawdown = calcMaxDrawdownStats(path).maxDrawdown;
  const volatility = calcAnnualizedStdev(dailyReturns);
  const sharpe = volatility > 0 ? (cagr - 0.02) / volatility : 0;
  const sortino = calcSortino(dailyReturns);

  return { finalValue, cagr, maxDrawdown, volatility, sharpe, sortino };
}

/**
 * 将路径降采样为月度数据
 */
function downsampleMonthly(path: number[]): number[] {
  if (path.length === 0) return [];
  const result: number[] = [path[0]];
  let day = 21;
  while (day < path.length) {
    result.push(path[day]);
    day += 21;
  }
  // 确保最后一个点包含
  const last = path[path.length - 1];
  if (result[result.length - 1] !== last) {
    result.push(last);
  }
  return result;
}

/**
 * 计算百分位路径
 */
function calcPercentiles(paths: number[][], totalDays: number): MonteCarloResult['percentiles'] {
  const percentileKeys = ['p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95'] as const;
  const percentileValues = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
  const result: Record<string, number[]> = {};

  for (let k = 0; k < percentileKeys.length; k++) {
    result[percentileKeys[k]] = [];
  }

  for (let day = 0; day <= totalDays; day++) {
    const dayValues = paths.map((p) => p[day] ?? p[p.length - 1]).sort((a, b) => a - b);
    for (let k = 0; k < percentileKeys.length; k++) {
      const idx = Math.floor(dayValues.length * percentileValues[k]);
      result[percentileKeys[k]].push(dayValues[Math.min(idx, dayValues.length - 1)]);
    }
  }

  return result as MonteCarloResult['percentiles'];
}

/**
 * 计算成功概率（每个时间点价值超过阈值的比例）
 */
function calcSuccessProbability(paths: number[][], threshold: number): number[] {
  const totalDays = paths[0].length;
  const result: number[] = [];

  for (let day = 0; day < totalDays; day++) {
    const successCount = paths.filter((p) => (p[day] ?? 0) >= threshold).length;
    result.push(successCount / paths.length);
  }

  return result;
}

/**
 * 计算三种成功概率（按年采样）
 */
function calcSuccessProbabilities(
  paths: number[][],
  numYears: number,
): MonteCarloResult['successProbabilities'] {
  if (paths.length === 0) {
    return {
      survival: Array(numYears).fill(0),
      capitalPreservation: Array(numYears).fill(0),
      profit: Array(numYears).fill(0),
    };
  }

  const n = paths.length;
  const survival: number[] = [];
  const capitalPreservation: number[] = [];
  const profit: number[] = [];

  for (let year = 1; year <= numYears; year++) {
    const dayIdx = Math.min(Math.round(year * TRADING_DAYS_PER_YEAR), paths[0].length - 1);
    let survCount = 0;
    let capCount = 0;
    let profCount = 0;

    for (const p of paths) {
      const val = p[dayIdx] ?? 0;
      if (val > 0) survCount++;
      if (val >= 1.0) capCount++;
      if (val > 1.0) profCount++;
    }

    survival.push(survCount / n);
    capitalPreservation.push(capCount / n);
    profit.push(profCount / n);
  }

  return { survival, capitalPreservation, profit };
}

/**
 * 创建直方图分布
 */
function createHistogram(values: number[], bins: number): number[] {
  if (values.length === 0) return Array(bins).fill(0);

  const { min: minVal, max: maxVal } = values.reduce(
    (acc, v) => ({ min: Math.min(acc.min, v), max: Math.max(acc.max, v) }),
    { min: values[0], max: values[0] },
  );
  const binWidth = (maxVal - minVal) / bins || 1;
  const histogram = Array(bins).fill(0);

  for (const v of values) {
    const bin = Math.min(Math.floor((v - minVal) / binWidth), bins - 1);
    histogram[bin]++;
  }

  return histogram;
}

/**
 * 创建空响应
 */
function createEmptyResponse(numYears: number): MonteCarloResult {
  const totalDays = Math.round(numYears * TRADING_DAYS_PER_YEAR);
  const zeros = Array(totalDays + 1).fill(0);
  return {
    percentiles: {
      p5: zeros,
      p10: zeros,
      p25: zeros,
      p50: zeros,
      p75: zeros,
      p90: zeros,
      p95: zeros,
    },
    successProbability: zeros,
    finalDistribution: Array(50).fill(0),
    statistics: { medianFinalValue: 0, meanFinalValue: 0, successRate: 0 },
    perPathMetrics: [],
    representativePaths: { best: [], p25: [], median: [], p75: [], worst: [] },
    successProbabilities: {
      survival: Array(numYears).fill(0),
      capitalPreservation: Array(numYears).fill(0),
      profit: Array(numYears).fill(0),
    },
  };
}
