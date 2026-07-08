/**
 * 组合优化模块（Node.js降级后备）
 * 主引擎为 Go(engine-go, localhost:5004)；本文件作为一致性参照保留，不用于线上降级（ADR-031）。
 * 对应 Go 实现: engine-go/internal/engine/optimizer.go
 *
 * 使用分析解法（二次规划）替代随机搜索，精确求解有效前沿。
 * 复杂度从 O(10000 × N²) 降到 O(N³)。
 */

import type { OptimizationResult, EfficientFrontierResult } from '@backtest/shared/types';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import type { PriceData } from './growthCurve.js';
import { calcCovariance, calcPortfolioReturn, calcPortfolioVolatility } from './statistics.js';
import {
  OptimizeObjective,
  OptimizeConstraints,
  solveMinVariance,
  solveMaxSharpe,
  solveTargetReturn,
  clipNegativeWeights,
  solveMaxSharpeClosedForm,
} from './optimizerSolvers.js';

/**
 * 计算各资产的年化收益率和协方差矩阵
 */
/** 收集各标的有效价格映射 */
function collectTickerPrices(
  tickers: string[],
  priceData: PriceData,
): Map<string, Map<string, number>> {
  const tickerDatePrices: Map<string, Map<string, number>> = new Map();
  const validTickers: string[] = [];
  for (const ticker of tickers) {
    if (!priceData[ticker]) continue;
    const dateMap = new Map<string, number>();
    for (const [date, price] of Object.entries(priceData[ticker])) {
      if (price > 0) dateMap.set(date, price);
    }
    if (dateMap.size < 2) continue;
    tickerDatePrices.set(ticker, dateMap);
    validTickers.push(ticker);
  }
  return tickerDatePrices;
}

/** 求所有标的的共有交易日 */
function findCommonDates(
  validTickers: string[],
  tickerDatePrices: Map<string, Map<string, number>>,
): string[] {
  const firstTicker = validTickers[0];
  const firstMap = tickerDatePrices.get(firstTicker);
  if (!firstMap) return [];
  let commonDates: Set<string> = new Set(firstMap.keys());
  for (let i = 1; i < validTickers.length; i++) {
    const map = tickerDatePrices.get(validTickers[i]);
    if (!map) continue;
    const newCommon = new Set<string>();
    for (const d of commonDates) {
      if (map.has(d)) newCommon.add(d);
    }
    commonDates = newCommon;
  }
  return Array.from(commonDates).sort();
}

/** 计算各标的的日收益率序列 */
function calcAllReturns(
  validTickers: string[],
  tickerDatePrices: Map<string, Map<string, number>>,
  sortedDates: string[],
): number[][] {
  const allReturns: number[][] = [];
  for (const ticker of validTickers) {
    const dateMap = tickerDatePrices.get(ticker);
    if (!dateMap) continue;
    const returns: number[] = [];
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = dateMap.get(sortedDates[i - 1]) ?? 0;
      const curr = dateMap.get(sortedDates[i]) ?? 0;
      if (prev > 0) {
        returns.push((curr - prev) / prev);
      }
    }
    allReturns.push(returns);
  }
  return allReturns;
}

function calcReturnAndCov(
  tickers: string[],
  priceData: PriceData,
): { meanReturns: number[]; covMatrix: number[][]; validTickers: string[] } {
  const tickerDatePrices = collectTickerPrices(tickers, priceData);
  const validTickers = Array.from(tickerDatePrices.keys());

  if (validTickers.length === 0) {
    return { meanReturns: [], covMatrix: [], validTickers: [] };
  }

  const sortedDates = findCommonDates(validTickers, tickerDatePrices);
  if (sortedDates.length < 2) {
    return { meanReturns: [], covMatrix: [], validTickers: [] };
  }

  const alignedReturns = calcAllReturns(validTickers, tickerDatePrices, sortedDates);

  const meanReturns = alignedReturns.map((r) => {
    let cumProd = 1;
    for (const ret of r) cumProd *= 1 + ret;
    return Math.pow(cumProd, TRADING_DAYS_PER_YEAR / r.length) - 1;
  });

  const n = alignedReturns.length;
  const covMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const cov = calcCovariance(alignedReturns[i], alignedReturns[j]);
      covMatrix[i][j] = cov * TRADING_DAYS_PER_YEAR;
      covMatrix[j][i] = covMatrix[i][j];
    }
  }

  return { meanReturns, covMatrix, validTickers };
}

/**
 * 组合优化 - 分析解法
 */
export function optimizePortfolio(
  tickers: string[],
  priceData: PriceData,
  objective: OptimizeObjective = 'maxSharpe',
  constraints: OptimizeConstraints = {},
  riskFreeRate: number = 0.02,
): OptimizationResult {
  const { meanReturns, covMatrix, validTickers } = calcReturnAndCov(tickers, priceData);

  if (validTickers.length === 0) {
    return { optimalWeights: {}, expectedReturn: 0, expectedVolatility: 0, sharpeRatio: 0 };
  }

  const n = validTickers.length;
  let weights: number[];

  switch (objective) {
    case 'maxSharpe':
      weights = solveMaxSharpe(meanReturns, covMatrix, riskFreeRate, n);
      break;
    case 'minVolatility':
      weights = solveMinVariance(covMatrix, n);
      break;
    case 'maxReturn':
      // 最大收益 = 全仓最高收益资产
      weights = Array(n).fill(0);
      weights[meanReturns.indexOf(Math.max(...meanReturns))] = 1;
      break;
    default:
      weights = solveMaxSharpe(meanReturns, covMatrix, riskFreeRate, n);
  }

  // 应用权重约束
  const minW = constraints.minWeight ?? 0;
  const maxW = constraints.maxWeight ?? 1;
  if (minW > 0 || maxW < 1) {
    weights = applyWeightConstraints(weights, minW, maxW);
  }

  const optimalWeights: Record<string, number> = {};
  for (let i = 0; i < validTickers.length; i++) {
    optimalWeights[validTickers[i]] = Math.round(weights[i] * 10000) / 10000;
  }

  const expectedReturn = calcPortfolioReturn(weights, meanReturns);
  const expectedVolatility = calcPortfolioVolatility(weights, covMatrix);
  const sharpeRatio =
    expectedVolatility > 0 ? (expectedReturn - riskFreeRate) / expectedVolatility : 0;

  return { optimalWeights, expectedReturn, expectedVolatility, sharpeRatio };
}

/**
 * 应用权重约束（简单裁剪 + 归一化）
 */
function applyWeightConstraints(weights: number[], minW: number, maxW: number): number[] {
  const n = weights.length;
  // 约束不可行时，返回等权重作为最佳努力
  if (n * minW > 1 + 1e-6 || n * maxW < 1 - 1e-6) {
    return weights.map(() => 1 / n);
  }
  let result = weights.map((w) => Math.max(minW, Math.min(maxW, w)));

  // 迭代归一化直到收敛
  for (let iter = 0; iter < 20; iter++) {
    const sum = result.reduce((s, w) => s + w, 0);
    if (Math.abs(sum - 1) < 1e-8) break;
    result = result.map((w) => w / sum);
    result = result.map((w) => Math.max(minW, Math.min(maxW, w)));
  }

  // 最终归一化
  const sum = result.reduce((s, w) => s + w, 0);
  if (sum > 0) result = result.map((w) => w / sum);
  else result = Array(n).fill(1 / n);

  return result;
}

/**
 * 计算有效前沿 - 分析解法
 */
export function calcEfficientFrontier(
  tickers: string[],
  priceData: PriceData,
  numPoints: number = 20,
  riskFreeRate: number = 0.02,
): EfficientFrontierResult {
  const { meanReturns, covMatrix, validTickers } = calcReturnAndCov(tickers, priceData);

  if (validTickers.length === 0) {
    return { frontier: [] };
  }

  const n = validTickers.length;

  // 求解最小方差组合
  const minVolWeights = solveMinVariance(covMatrix, n);
  const minVolReturn = calcPortfolioReturn(minVolWeights, meanReturns);

  // 最大收益 = 最高收益资产（100% 权重）
  const maxRetIdx = meanReturns.indexOf(Math.max(...meanReturns));
  const maxRetWeights = Array(n).fill(0);
  maxRetWeights[maxRetIdx] = 1;
  const maxReturn = meanReturns[maxRetIdx];

  // 在最小方差收益到最大收益之间均匀取点
  const frontier: EfficientFrontierResult['frontier'] = [];
  const targetReturns = Array.from(
    { length: numPoints },
    (_, i) => minVolReturn + (i / (numPoints - 1)) * (maxReturn - minVolReturn),
  );

  for (const targetReturn of targetReturns) {
    const weights = solveTargetReturn(targetReturn, meanReturns, covMatrix, n, {
      minVolWeights,
      maxRetWeights,
      minVolReturn,
      maxReturn,
    });
    const ret = calcPortfolioReturn(weights, meanReturns);
    const vol = calcPortfolioVolatility(weights, covMatrix);
    const sharpe = vol > 0 ? (ret - riskFreeRate) / vol : 0;

    const weightMap: Record<string, number> = {};
    for (let i = 0; i < validTickers.length; i++) {
      weightMap[validTickers[i]] = Math.round(weights[i] * 10000) / 10000;
    }

    frontier.push({
      weights: weightMap,
      expectedReturn: ret,
      expectedVolatility: vol,
      sharpeRatio: sharpe,
    });
  }

  return { frontier };
}

/**
 * 单元测试专用导出（非公开 API）。
 *
 * 企业理由：clipNegativeWeights / applyWeightConstraints 等内部算法分支
 * 仅能通过构造输入触发，集成测试难以稳定覆盖。
 */
export const __optimizerTestOnly = {
  clipNegativeWeights,
  solveTargetReturn,
  solveMaxSharpeClosedForm,
  calcCovariance,
  applyWeightConstraints,
};
