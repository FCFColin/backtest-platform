/**
 * 组合优化模块（Node.js降级后备）
 * 优先使用Rust引擎(localhost:5002)，此文件仅在Rust引擎不可用时启用
 * 对应Rust实现: engine-rs/src/optimizer.rs
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

/**
 * 计算各资产的年化收益率和协方差矩阵
 */
function calcReturnAndCov(
  tickers: string[],
  priceData: PriceData,
): { meanReturns: number[]; covMatrix: number[][]; validTickers: string[] } {
  const validTickers: string[] = [];
  const tickerDatePrices: Map<string, Map<string, number>> = new Map();

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

  if (validTickers.length === 0) {
    return { meanReturns: [], covMatrix: [], validTickers: [] };
  }

  // 找到所有标的共有的交易日（按日期对齐，避免不同标的价格序列错位）
  let commonDates: Set<string>;
  const firstTicker = validTickers[0];
  const firstMap = tickerDatePrices.get(firstTicker)!;
  commonDates = new Set(firstMap.keys());
  for (let i = 1; i < validTickers.length; i++) {
    const map = tickerDatePrices.get(validTickers[i])!;
    const newCommon = new Set<string>();
    for (const d of commonDates) {
      if (map.has(d)) newCommon.add(d);
    }
    commonDates = newCommon;
  }

  const sortedDates = Array.from(commonDates).sort();
  if (sortedDates.length < 2) {
    return { meanReturns: [], covMatrix: [], validTickers: [] };
  }

  // 按共有日期计算各标的的日收益率
  const allReturns: number[][] = [];
  for (const ticker of validTickers) {
    const dateMap = tickerDatePrices.get(ticker)!;
    const returns: number[] = [];
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = dateMap.get(sortedDates[i - 1])!;
      const curr = dateMap.get(sortedDates[i])!;
      if (prev > 0) {
        returns.push((curr - prev) / prev);
      }
    }
    allReturns.push(returns);
  }

  const alignedReturns = allReturns;

  const meanReturns = alignedReturns.map((r) => {
    // 几何平均年化（复合年化收益率），而非算术平均
    let cumProd = 1;
    for (const ret of r) cumProd *= (1 + ret);
    const annualized = Math.pow(cumProd, TRADING_DAYS_PER_YEAR / r.length) - 1;
    return annualized;
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
    throw new Error(`Covariance calculation requires equal-length arrays, got ${x.length} and ${y.length}`);
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

/** 矩阵求逆（高斯-约旦消元法） */
function invertMatrix(mat: number[][]): number[][] | null {
  const n = mat.length;
  // 增广矩阵 [A | I]
  const aug: number[][] = mat.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    // 部分主元选取
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) return null; // 奇异矩阵

    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  const result = aug.map((row) => row.slice(n));

  // 条件数检查：最大对角元素 / 最小对角元素
  const diagElements = result.map((row, i) => Math.abs(row[i]));
  const maxDiag = Math.max(...diagElements);
  const minDiag = Math.min(...diagElements);
  if (minDiag > 0 && maxDiag / minDiag > 1e10) return null; // 矩阵过于病态

  return result;
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
function solveMaxSharpe(
  meanReturns: number[],
  covMatrix: number[][],
  riskFreeRate: number,
  n: number,
): number[] {
  if (n === 0) return [];
  if (n === 1) return [1];

  // N>15 时回退到闭式解+投影法（实际组合优化 N 通常 ≤10）
  if (n > 15) return solveMaxSharpeClosedForm(meanReturns, covMatrix, riskFreeRate, n);

  let bestSharpe = -Infinity;
  let bestWeights: number[] | null = null;

  // 枚举所有非空子集 (mask 从 1 到 2^N - 1)
  for (let mask = 1; mask < (1 << n); mask++) {
    const activeIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) activeIdx.push(i);
    }

    const activeN = activeIdx.length;
    const subMean = activeIdx.map((i) => meanReturns[i]);
    const subCov: number[][] = activeIdx.map((i) =>
      activeIdx.map((j) => covMatrix[i][j]),
    );

    let subWeights: number[];

    if (activeN === 1) {
      // 单资产组合
      subWeights = [1];
    } else {
      // 无约束切线组合：w ∝ Σ⁻¹(μ - rf·1)
      const excessReturns = subMean.map((r) => r - riskFreeRate);
      const subInv = invertMatrix(subCov);
      if (!subInv) continue;

      const subInvExcess = matVecMul(subInv, excessReturns);
      const denom = dot(Array(activeN).fill(1), subInvExcess);

      // 超额收益之和 ≤ 0，此子集无有效切线组合
      if (denom <= 1e-12) continue;

      subWeights = subInvExcess.map((v) => v / denom);

      // 有负权重，不满足非负约束，跳过
      if (subWeights.some((w) => w < -1e-8)) continue;
    }

    // 计算 Sharpe ratio
    const portReturn = calcPortfolioReturn(subWeights, subMean);
    const portVol = calcPortfolioVolatility(subWeights, subCov);
    const sharpe = portVol > 0 ? (portReturn - riskFreeRate) / portVol : -Infinity;

    if (sharpe > bestSharpe) {
      bestSharpe = sharpe;
      bestWeights = Array(n).fill(0);
      for (let k = 0; k < activeN; k++) {
        bestWeights[activeIdx[k]] = subWeights[k];
      }
    }
  }

  if (bestWeights) return bestWeights;

  // 回退：全仓最高收益资产
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
  minVolWeights?: number[],
  maxRetWeights?: number[],
  minVolReturn?: number,
  maxReturn?: number,
): number[] {
  const ones = Array(n).fill(1);
  const covInv = invertMatrix(covMatrix);
  if (!covInv) return Array(n).fill(1 / n);

  const covInvOnes = matVecMul(covInv, ones);
  const covInvMu = matVecMul(covInv, meanReturns);

  const a = dot(ones, covInvOnes);    // 1ᵀΣ⁻¹1
  const b = dot(ones, covInvMu);       // 1ᵀΣ⁻¹μ
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
    const qpResult = solveTargetReturnQP(
      targetReturn, meanReturns, covMatrix, n,
      minVolWeights, maxRetWeights, minVolReturn, maxReturn,
    );
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
  covMatrix: number[][],
  n: number,
  minVolWeights: number[],
  maxRetWeights: number[],
  minVolReturn: number,
  maxReturn: number,
): number[] | null {
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
      // 只有一个活跃资产，无法达到目标收益
      const weights = Array(n).fill(0);
      if (activeN === 1) weights[activeIdx[0]] = 1;
      return weights;
    }

    const subMean = activeIdx.map((i) => meanReturns[i]);
    const subCov: number[][] = activeIdx.map((i) =>
      activeIdx.map((j) => covMatrix[i][j]),
    );

    const subOnes = Array(activeN).fill(1);
    const subInv = invertMatrix(subCov);
    if (!subInv) break;

    const subInvOnes = matVecMul(subInv, subOnes);
    const subInvMu = matVecMul(subInv, subMean);

    const a = dot(subOnes, subInvOnes);
    const b = dot(subOnes, subInvMu);
    const c = dot(subMean, subInvMu);
    const det = a * c - b * b;

    if (Math.abs(det) < 1e-12) break;

    const lambda1 = (c - b * targetReturn) / det;
    const lambda2 = (a * targetReturn - b) / det;

    const subWeights = subInvOnes.map((v, i) => v * lambda1 + subInvMu[i] * lambda2);

    let hasNegative = false;
    for (let k = 0; k < activeN; k++) {
      if (subWeights[k] < -1e-8) {
        activeSet.delete(activeIdx[k]);
        hasNegative = true;
      }
    }

    if (!hasNegative) {
      const weights = Array(n).fill(0);
      for (let k = 0; k < activeN; k++) {
        weights[activeIdx[k]] = Math.max(0, subWeights[k]);
      }
      // 归一化
      const sum = weights.reduce((s, w) => s + w, 0);
      if (sum > 0) return weights.map((w) => w / sum);
      return Array(n).fill(1 / n);
    }
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
  _numIterations?: number, // 保留接口兼容，不再使用
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
  const sharpeRatio = expectedVolatility > 0 ? (expectedReturn - riskFreeRate) / expectedVolatility : 0;

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
  _numIterations?: number, // 保留接口兼容，不再使用
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
  const targetReturns = Array.from({ length: numPoints }, (_, i) =>
    minVolReturn + (i / (numPoints - 1)) * (maxReturn - minVolReturn),
  );

  for (const targetReturn of targetReturns) {
    const weights = solveTargetReturn(
      targetReturn, meanReturns, covMatrix, n,
      minVolWeights, maxRetWeights, minVolReturn, maxReturn,
    );
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
