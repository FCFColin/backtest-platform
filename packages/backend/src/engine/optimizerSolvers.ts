import { invertMatrix, matVecMul, dot } from './matrixOps.js';
import { calcPortfolioReturn, calcPortfolioVolatility } from './statistics.js';

export type OptimizeObjective = 'maxSharpe' | 'minVolatility' | 'maxReturn';

export interface OptimizeConstraints {
  minWeight?: number;
  maxWeight?: number;
}

export interface BoundaryWeights {
  minVolWeights: number[];
  maxRetWeights: number[];
  minVolReturn: number;
  maxReturn: number;
}

function clipAndNormalize(weights: number[], n: number): number[] {
  const clipped = weights.map((w) => Math.max(0, w));
  const sum = clipped.reduce((s, w) => s + w, 0);
  if (sum <= 0) return Array(n).fill(1 / n);
  return clipped.map((w) => w / sum);
}

export function solveMinVariance(covMatrix: number[][], n: number): number[] {
  const ones = Array(n).fill(1);
  const covInv = invertMatrix(covMatrix);
  if (!covInv) return Array(n).fill(1 / n);

  const covInvOnes = matVecMul(covInv, ones);
  const denom = dot(ones, covInvOnes);
  if (Math.abs(denom) < 1e-12) return Array(n).fill(1 / n);

  return covInvOnes.map((v) => v / denom);
}

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

export function solveMaxSharpe(
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

export function solveMaxSharpeClosedForm(
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

  if (denom <= 1e-12) return solveMinVariance(covMatrix, n);

  const weights = covInvExcess.map((v) => v / denom);

  if (weights.some((w) => w < -1e-8)) {
    return clipAndNormalize(weights, n);
  }

  return weights;
}

export function solveTargetReturn(
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

  const a = dot(ones, covInvOnes);
  const b = dot(ones, covInvMu);
  const c = dot(meanReturns, covInvMu);

  const det = a * c - b * b;
  if (Math.abs(det) < 1e-12) return Array(n).fill(1 / n);

  const lambda1 = (c - b * targetReturn) / det;
  const lambda2 = (a * targetReturn - b) / det;

  const weights = covInvOnes.map((v, i) => v * lambda1 + covInvMu[i] * lambda2);

  if (weights.every((w) => w >= -1e-8)) {
    return clipAndNormalize(weights, n);
  }

  if (minVolWeights && maxRetWeights && minVolReturn !== undefined && maxReturn !== undefined) {
    const qpResult = solveTargetReturnQP(targetReturn, meanReturns, covMatrix, n, {
      minVolWeights,
      maxRetWeights,
      minVolReturn,
      maxReturn,
    });
    if (qpResult) return qpResult;
  }

  return clipNegativeWeights(targetReturn, meanReturns, covMatrix, n);
}

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

  const alpha = (targetReturn - minVolReturn) / range;
  let weights = minVolWeights.map((w, i) => (1 - alpha) * w + alpha * maxRetWeights[i]);

  const maxIterations = 50;
  const tolerance = 1e-10;

  for (let iter = 0; iter < maxIterations; iter++) {
    weights = weights.map((w) => Math.max(0, w));

    const sum = weights.reduce((s, w) => s + w, 0);
    if (sum < 1e-12) return null;
    weights = weights.map((w) => w / sum);

    const currentReturn = calcPortfolioReturn(weights, meanReturns);
    const returnDiff = targetReturn - currentReturn;

    if (Math.abs(returnDiff) < tolerance) break;

    const gradReturn = meanReturns.slice();
    const gradNorm = Math.sqrt(gradReturn.reduce((s, g) => s + g * g, 0));
    if (gradNorm < 1e-12) break;

    const stepSize = returnDiff / (gradNorm * gradNorm);

    const newWeights = weights.map((w, i) => w + stepSize * gradReturn[i]);

    weights = newWeights.map((w) => Math.max(0, w));
    const newSum = weights.reduce((s, w) => s + w, 0);
    if (newSum < 1e-12) return null;
    weights = weights.map((w) => w / newSum);

    const newReturn = calcPortfolioReturn(weights, meanReturns);
    if (Math.abs(newReturn - targetReturn) < tolerance) break;
  }

  const finalReturn = calcPortfolioReturn(weights, meanReturns);
  if (Math.abs(finalReturn - targetReturn) > 0.01) return null;

  return weights;
}

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

function buildNormalizedWeights(activeIdx: number[], subWeights: number[], n: number): number[] {
  const weights = Array(n).fill(0);
  for (let k = 0; k < activeIdx.length; k++) {
    weights[activeIdx[k]] = Math.max(0, subWeights[k]);
  }
  const sum = weights.reduce((s, w) => s + w, 0);
  return sum > 0 ? weights.map((w) => w / sum) : Array(n).fill(1 / n);
}

function removeNegativeAssets(
  activeSet: Set<number>,
  activeIdx: number[],
  weights: number[],
): void {
  for (let k = 0; k < activeIdx.length; k++) {
    if (weights[k] < -1e-8) activeSet.delete(activeIdx[k]);
  }
}

export function clipNegativeWeights(
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
