/**
 * 组合优化模块（Node.js降级后备）
 * 主引擎为 Go(engine-go, localhost:5004)；本文件作为一致性参照保留，不用于线上降级（ADR-031）。
 * 对应 Go 实现: engine-go/internal/engine/optimizer.go
 *
 * 使用分析解法（二次规划）替代随机搜索，精确求解有效前沿。
 * 复杂度从 O(10000 × N²) 降到 O(N³)。
 */

import type { OptimizationResult, EfficientFrontierResult } from '../../shared/types.js';
import { TRADING_DAYS_PER_YEAR } from '../../shared/constants.js';
import type { PriceData } from './portfolio.js';

type OptimizeObjective = 'maxSharpe' | 'minVolatility' | 'maxReturn';

interface OptimizeConstraints {
  minWeight?: number;
  maxWeight?: number;
}

/** 有效前沿边界组合权重（用于目标收益率求解的迭代投影法） */
interface BoundaryWeights {
  minVolWeights: number[];
  maxRetWeights: number[];
  minVolReturn: number;
  maxReturn: number;
}

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

function calcCovariance(x: number[], y: number[]): number {
  if (x.length !== y.length) {
    throw new Error(
      `Covariance calculation requires equal-length arrays, got ${x.length} and ${y.length}`,
    );
  }
  const n = x.length;
  if (n < 2) return 0;

  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - meanX) * (y[i] - meanY);
  }
  return cov / (n - 1);
}

function calcPortfolioReturn(weights: number[], meanReturns: number[]): number {
  return weights.reduce((s, w, i) => s + w * meanReturns[i], 0);
}

function calcPortfolioVolatility(weights: number[], covMatrix: number[][]): number {
  const n = weights.length;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += weights[i] * weights[j] * covMatrix[i][j];
    }
  }
  return Math.sqrt(Math.max(0, variance));
}

// ===== 矩阵运算 =====

/** 条件数检查：最大对角元素 / 最小对角元素 */
function isWellConditioned(result: number[][]): boolean {
  const diagElements = result.map((row, i) => Math.abs(row[i]));
  const maxDiag = Math.max(...diagElements);
  const minDiag = Math.min(...diagElements);
  return minDiag <= 0 || maxDiag / minDiag <= 1e10;
}

/** 找到列中绝对值最大的行（部分主元选择） */
function findPivotRow(aug: number[][], col: number, n: number): number {
  let maxRow = col;
  for (let row = col + 1; row < n; row++) {
    if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
  }
  return maxRow;
}

/** 用主元除当前行，使主元位置变为 1 */
function normalizePivotRow(aug: number[][], col: number, n: number): void {
  const pivot = aug[col][col];
  for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
}

/** 消去其他行在当前列的元素 */
function eliminateColumn(aug: number[][], col: number, n: number): void {
  for (let row = 0; row < n; row++) {
    if (row === col) continue;
    const factor = aug[row][col];
    for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
  }
}

/** 矩阵求逆（高斯-约旦消元法） */
function invertMatrix(mat: number[][]): number[][] | null {
  const n = mat.length;
  const aug: number[][] = mat.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    const maxRow = findPivotRow(aug, col, n);
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) return null;

    normalizePivotRow(aug, col, n);
    eliminateColumn(aug, col, n);
  }

  const result = aug.map((row) => row.slice(n));
  return isWellConditioned(result) ? result : null;
}

/** 矩阵 × 向量 */
function matVecMul(mat: number[][], vec: number[]): number[] {
  return mat.map((row) => row.reduce((s, v, j) => s + v * vec[j], 0));
}

/** 向量点积 */
function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

// ===== 分析解法 =====

/**
 * 求解全局最小方差组合（无约束）
 * w = Σ⁻¹ × 1 / (1ᵀ × Σ⁻¹ × 1)
 */
function solveMinVariance(covMatrix: number[][], n: number): number[] {
  const ones = Array(n).fill(1);
  const covInv = invertMatrix(covMatrix);
  if (!covInv) return Array(n).fill(1 / n);

  const covInvOnes = matVecMul(covInv, ones);
  const denom = dot(ones, covInvOnes);
  if (Math.abs(denom) < 1e-12) return Array(n).fill(1 / n);

  return covInvOnes.map((v) => v / denom);
}

/**
 * 求解最大 Sharpe 组合（带非负约束）
 *
 * 核心思路：枚举所有非空资产子集，对每个子集求无约束切线组合，
 * 若权重均非负则计算 Sharpe，取全局最优。
 *
 * 对于 N≤15 的组合优化，2^N-1 次枚举完全可行（3 个资产仅 7 次），
 * 且保证找到全局最优解，不会陷入迭代投影法的局部最优。
 */
/** 计算子集的无约束切线组合权重 */
function solveTangentSubset(
  subMean: number[],
  subCov: number[][],
  riskFreeRate: number,
  activeN: number,
): number[] | null {
  const excessReturns = subMean.map((r) => r - riskFreeRate);
  const subInv = invertMatrix(subCov);
  if (!subInv) return null;

  const subInvExcess = matVecMul(subInv, excessReturns);
  const denom = dot(Array(activeN).fill(1), subInvExcess);
  if (denom <= 1e-12) return null;

  const subWeights = subInvExcess.map((v) => v / denom);
  if (subWeights.some((w) => w < -1e-8)) return null;
  return subWeights;
}

/** 评估单个子集的 Sharpe ratio，返回最优权重或 null */
function evalSubsetSharpe(
  mask: number,
  n: number,
  meanReturns: number[],
  covMatrix: number[][],
  riskFreeRate: number,
): { sharpe: number; weights: number[] } | null {
  const activeIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (mask & (1 << i)) activeIdx.push(i);
  }

  const activeN = activeIdx.length;
  const subMean = activeIdx.map((i) => meanReturns[i]);
  const subCov: number[][] = activeIdx.map((i) => activeIdx.map((j) => covMatrix[i][j]));

  let subWeights: number[];
  if (activeN === 1) {
    subWeights = [1];
  } else {
    const solved = solveTangentSubset(subMean, subCov, riskFreeRate, activeN);
    if (!solved) return null;
    subWeights = solved;
  }

  const portReturn = calcPortfolioReturn(subWeights, subMean);
  const portVol = calcPortfolioVolatility(subWeights, subCov);
  const sharpe = portVol > 0 ? (portReturn - riskFreeRate) / portVol : -Infinity;

  const weights = Array(n).fill(0);
  for (let k = 0; k < activeN; k++) {
    weights[activeIdx[k]] = subWeights[k];
  }
  return { sharpe, weights };
}

function solveMaxSharpe(
  meanReturns: number[],
  covMatrix: number[][],
  riskFreeRate: number,
  n: number,
): number[] {
  if (n === 0) return [];
  if (n === 1) return [1];
  if (n > 15) return solveMaxSharpeClosedForm(meanReturns, covMatrix, riskFreeRate, n);

  let bestSharpe = -Infinity;
  let bestWeights: number[] | null = null;

  for (let mask = 1; mask < 1 << n; mask++) {
    const result = evalSubsetSharpe(mask, n, meanReturns, covMatrix, riskFreeRate);
    if (result && result.sharpe > bestSharpe) {
      bestSharpe = result.sharpe;
      bestWeights = result.weights;
    }
  }

  if (bestWeights) return bestWeights;

  const weights = Array(n).fill(0);
  weights[meanReturns.indexOf(Math.max(...meanReturns))] = 1;
  return weights;
}

/**
 * 闭式切线组合 + 投影法（仅用于 N>15 的大规模场景）
 */
function solveMaxSharpeClosedForm(
  meanReturns: number[],
  covMatrix: number[][],
  riskFreeRate: number,
  n: number,
): number[] {
  const excessReturns = meanReturns.map((r) => r - riskFreeRate);
  const covInv = invertMatrix(covMatrix);
  if (!covInv) return Array(n).fill(1 / n);

  const covInvExcess = matVecMul(covInv, excessReturns);
  const denom = dot(Array(n).fill(1), covInvExcess);

  // 如果超额收益之和为负或为零，回退到最小方差
  if (denom <= 1e-12) return solveMinVariance(covMatrix, n);

  const weights = covInvExcess.map((v) => v / denom);

  // 如果有负权重，裁剪到非负
  if (weights.some((w) => w < -1e-8)) {
    // 简单裁剪：将负权重置零后归一化
    const clipped = weights.map((w) => Math.max(0, w));
    const sum = clipped.reduce((s, w) => s + w, 0);
    if (sum > 0) return clipped.map((w) => w / sum);
    return solveMinVariance(covMatrix, n);
  }

  return weights;
}

/**
 * 求解目标收益率下的最小方差组合
 * 使用拉格朗日乘数法
 */
function solveTargetReturn(
  targetReturn: number,
  meanReturns: number[],
  covMatrix: number[][],
  n: number,
  boundary?: BoundaryWeights,
): number[] {
  const { minVolWeights, maxRetWeights, minVolReturn, maxReturn } = boundary ?? {};
  const ones = Array(n).fill(1);
  const covInv = invertMatrix(covMatrix);
  if (!covInv) return Array(n).fill(1 / n);

  const covInvOnes = matVecMul(covInv, ones);
  const covInvMu = matVecMul(covInv, meanReturns);

  const a = dot(ones, covInvOnes); // 1ᵀΣ⁻¹1
  const b = dot(ones, covInvMu); // 1ᵀΣ⁻¹μ
  const c = dot(meanReturns, covInvMu); // μᵀΣ⁻¹μ

  const det = a * c - b * b;
  if (Math.abs(det) < 1e-12) return Array(n).fill(1 / n);

  // λ1 = (c - b×targetReturn) / det
  // λ2 = (a×targetReturn - b) / det
  const lambda1 = (c - b * targetReturn) / det;
  const lambda2 = (a * targetReturn - b) / det;

  // w = λ1 × Σ⁻¹1 + λ2 × Σ⁻¹μ
  const weights = covInvOnes.map((v, i) => v * lambda1 + covInvMu[i] * lambda2);

  // 闭式解满足非负约束，直接使用
  if (weights.every((w) => w >= -1e-8)) {
    const clipped = weights.map((w) => Math.max(0, w));
    const sum = clipped.reduce((s, w) => s + w, 0);
    return sum > 1e-10 ? clipped.map((w) => w / sum) : clipped;
  }

  // 闭式解有负权重：使用迭代投影法替代线性插值
  if (minVolWeights && maxRetWeights && minVolReturn !== undefined && maxReturn !== undefined) {
    const qpResult = solveTargetReturnQP(targetReturn, meanReturns, covMatrix, n, {
      minVolWeights,
      maxRetWeights,
      minVolReturn,
      maxReturn,
    });
    if (qpResult) return qpResult;
  }

  // 回退：裁剪负权重
  return clipNegativeWeights(targetReturn, meanReturns, covMatrix, n);
}

/**
 * 迭代投影法求解目标收益率下的最小方差组合（带非负约束）
 * 1. 以线性插值为初始猜测
 * 2. 投影到可行集（权重 >= 0, sum = 1）
 * 3. 调整以满足目标收益约束
 * 4. 迭代直到收敛（最多 50 次）
 */
function solveTargetReturnQP(
  targetReturn: number,
  meanReturns: number[],
  _covMatrix: number[][],
  _n: number,
  boundary: BoundaryWeights,
): number[] | null {
  const { minVolWeights, maxRetWeights, minVolReturn, maxReturn } = boundary;
  const range = maxReturn - minVolReturn;
  if (range <= 1e-12) return null;

  // 初始猜测：线性插值
  const alpha = (targetReturn - minVolReturn) / range;
  let weights = minVolWeights.map((w, i) => (1 - alpha) * w + alpha * maxRetWeights[i]);

  const maxIterations = 50;
  const tolerance = 1e-10;

  for (let iter = 0; iter < maxIterations; iter++) {
    // 步骤 1：投影到非负约束
    weights = weights.map((w) => Math.max(0, w));

    // 步骤 2：归一化使权重之和为 1
    const sum = weights.reduce((s, w) => s + w, 0);
    if (sum < 1e-12) return null;
    weights = weights.map((w) => w / sum);

    // 步骤 3：调整以满足目标收益约束
    const currentReturn = calcPortfolioReturn(weights, meanReturns);
    const returnDiff = targetReturn - currentReturn;

    if (Math.abs(returnDiff) < tolerance) break;

    // 沿梯度方向调整权重以逼近目标收益
    // 使用收益梯度 μ_i，投影到可行方向
    const gradReturn = meanReturns.slice();
    const gradNorm = Math.sqrt(gradReturn.reduce((s, g) => s + g * g, 0));
    if (gradNorm < 1e-12) break;

    // 步长：沿梯度方向移动以消除收益偏差
    const stepSize = returnDiff / (gradNorm * gradNorm);

    // 沿梯度方向移动
    const newWeights = weights.map((w, i) => w + stepSize * gradReturn[i]);

    // 重新投影到可行集
    weights = newWeights.map((w) => Math.max(0, w));
    const newSum = weights.reduce((s, w) => s + w, 0);
    if (newSum < 1e-12) return null;
    weights = weights.map((w) => w / newSum);

    // 检查收敛
    const newReturn = calcPortfolioReturn(weights, meanReturns);
    if (Math.abs(newReturn - targetReturn) < tolerance) break;
  }

  // 验证结果是否合理
  const finalReturn = calcPortfolioReturn(weights, meanReturns);
  if (Math.abs(finalReturn - targetReturn) > 0.01) return null; // 偏差过大，回退

  return weights;
}

/**
 * 带非负约束的目标收益率最小方差（迭代投影法）
 */
/** 对活跃子集求解目标收益率下的闭式权重 */
function solveActiveSubset(
  activeIdx: number[],
  targetReturn: number,
  meanReturns: number[],
  covMatrix: number[][],
): { weights: number[]; hasNegative: boolean } | null {
  const activeN = activeIdx.length;
  const subMean = activeIdx.map((i) => meanReturns[i]);
  const subCov: number[][] = activeIdx.map((i) => activeIdx.map((j) => covMatrix[i][j]));

  const subOnes = Array(activeN).fill(1);
  const subInv = invertMatrix(subCov);
  if (!subInv) return null;

  const subInvOnes = matVecMul(subInv, subOnes);
  const subInvMu = matVecMul(subInv, subMean);

  const a = dot(subOnes, subInvOnes);
  const b = dot(subOnes, subInvMu);
  const c = dot(subMean, subInvMu);
  const det = a * c - b * b;
  if (Math.abs(det) < 1e-12) return null;

  const lambda1 = (c - b * targetReturn) / det;
  const lambda2 = (a * targetReturn - b) / det;
  const subWeights = subInvOnes.map((v, i) => v * lambda1 + subInvMu[i] * lambda2);

  let hasNegative = false;
  for (let k = 0; k < activeN; k++) {
    if (subWeights[k] < -1e-8) hasNegative = true;
  }
  return { weights: subWeights, hasNegative };
}

/** 从活跃子集结果构建全量权重数组并归一化 */
function buildNormalizedWeights(activeIdx: number[], subWeights: number[], n: number): number[] {
  const weights = Array(n).fill(0);
  for (let k = 0; k < activeIdx.length; k++) {
    weights[activeIdx[k]] = Math.max(0, subWeights[k]);
  }
  const sum = weights.reduce((s, w) => s + w, 0);
  return sum > 0 ? weights.map((w) => w / sum) : Array(n).fill(1 / n);
}

/** 从活跃集中移除负权重资产 */
function removeNegativeAssets(
  activeSet: Set<number>,
  activeIdx: number[],
  weights: number[],
): void {
  for (let k = 0; k < activeIdx.length; k++) {
    if (weights[k] < -1e-8) activeSet.delete(activeIdx[k]);
  }
}

function clipNegativeWeights(
  targetReturn: number,
  meanReturns: number[],
  covMatrix: number[][],
  n: number,
): number[] {
  const activeSet = new Set(Array.from({ length: n }, (_, i) => i));

  for (let iter = 0; iter < 20; iter++) {
    const activeIdx = Array.from(activeSet);
    const activeN = activeIdx.length;
    if (activeN < 2) {
      const weights = Array(n).fill(0);
      if (activeN === 1) weights[activeIdx[0]] = 1;
      return weights;
    }

    const result = solveActiveSubset(activeIdx, targetReturn, meanReturns, covMatrix);
    if (!result) break;

    if (!result.hasNegative) {
      return buildNormalizedWeights(activeIdx, result.weights, n);
    }

    removeNegativeAssets(activeSet, activeIdx, result.weights);
  }

  return solveMinVariance(covMatrix, n);
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
