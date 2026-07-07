/**
 * Fama-French 因子回归计算
 * 使用 Kenneth French 数据库的真实因子数据
 */

import { FF_DATA } from '../data/famaFrench.js';

export interface RegressionInput {
  /** 月度组合收益率（小数，如 0.01 = 1%） */
  monthlyReturns: Array<{ date: string; value: number }>;
}

export interface RegressionResult {
  alpha: number;
  beta: number;
  smb: number;
  hml: number;
  rSquared: number;
  residuals: number[];
}

/** 因子名 → 对齐数据中对应字段的访问器 */
type FactorKey = 'mktRF' | 'smb' | 'hml';
const FACTOR_ACCESSORS: Record<
  FactorKey,
  (d: { mkt: number; smb: number; hml: number }) => number
> = {
  mktRF: (d) => d.mkt,
  smb: (d) => d.smb,
  hml: (d) => d.hml,
};

/** 矩阵乘法 */
function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length,
    n = B[0].length,
    p = A[0].length;
  const C = Array.from({ length: m }, () => Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) for (let k = 0; k < p; k++) C[i][j] += A[i][k] * B[k][j];
  return C;
}

/** 矩阵转置 */
function transpose(A: number[][]): number[][] {
  return A[0].map((_, i) => A.map((r) => r[i]));
}

/** 对增广矩阵的一行做消元 */
function eliminateRow(aug: number[][], row: number, col: number, n: number): void {
  const factor = aug[row][col];
  for (let j = col; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
}

/** 矩阵求逆（高斯消元，3x3 以下） */
function invert2D(A: number[][]): number[][] {
  const n = A.length;
  const aug = A.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    for (let j = col; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) if (row !== col) eliminateRow(aug, row, col, n);
  }
  return aug.map((row) => row.slice(n));
}

/**
 * 计算月度收益：对给定日收益率序列按月分组，计算月内复利收益
 */
export function computeMonthlyReturns(
  dailyReturns: number[],
  dates: string[],
): Array<{ date: string; value: number }> {
  const monthlyMap = new Map<string, number[]>();
  for (let i = 0; i < dates.length; i++) {
    const monthKey = dates[i].slice(0, 7);
    if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, []);
    monthlyMap.get(monthKey)!.push(dailyReturns[i]);
  }
  const result: Array<{ date: string; value: number }> = [];
  for (const [month, returns] of monthlyMap) {
    const monthlyReturn = returns.reduce((acc, r) => (1 + acc) * (1 + r) - 1, 0);
    result.push({ date: month, value: monthlyReturn });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/** 过滤并对齐因子数据与组合收益 */
function alignFactorData(
  input: RegressionInput,
  startDate?: string,
  endDate?: string,
): Array<{ ret: number; mkt: number; smb: number; hml: number }> {
  let ffData = [...FF_DATA];
  if (startDate) ffData = ffData.filter((d) => d.date >= startDate.slice(0, 7));
  if (endDate) ffData = ffData.filter((d) => d.date <= endDate.slice(0, 7));

  const returnMap = new Map(input.monthlyReturns.map((r) => [r.date, r.value]));
  const aligned: Array<{ ret: number; mkt: number; smb: number; hml: number }> = [];

  for (const fp of ffData) {
    const retVal = returnMap.get(fp.date);
    if (retVal === undefined) continue;
    aligned.push({
      ret: retVal,
      mkt: fp.mktRf / 100, // % → 小数
      smb: fp.smb / 100,
      hml: fp.hml / 100,
    });
  }
  return aligned;
}

/** 构建设计矩阵 X 和响应向量 Y */
function buildDesignMatrix(
  aligned: Array<{ ret: number; mkt: number; smb: number; hml: number }>,
  activeFactors: FactorKey[],
): { X: number[][]; Y: number[] } {
  const n = aligned.length;
  const colCount = 1 + activeFactors.length;
  const X: number[][] = Array.from({ length: n }, () => Array(colCount).fill(0));
  const Y: number[] = Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    X[i][0] = 1; // 截距
    for (let f = 0; f < activeFactors.length; f++) {
      X[i][f + 1] = FACTOR_ACCESSORS[activeFactors[f]](aligned[i]);
    }
    Y[i] = aligned[i].ret;
  }
  return { X, Y };
}

/** 计算拟合值、残差和 R² */
function computeFitStats(
  X: number[][],
  Y: number[],
  beta: number[],
  activeFactors: FactorKey[],
): { rSquared: number; residuals: number[] } {
  const n = Y.length;
  const fitted: number[] = Array(n).fill(0);
  const residuals: number[] = Array(n).fill(0);
  let ssRes = 0,
    ssTot = 0;
  const meanY = Y.reduce((s, v) => s + v, 0) / n;

  for (let i = 0; i < n; i++) {
    fitted[i] = beta[0]; // alpha
    for (let f = 0; f < activeFactors.length; f++) {
      fitted[i] += beta[f + 1] * X[i][f + 1];
    }
    residuals[i] = Y[i] - fitted[i];
    ssRes += residuals[i] ** 2;
    ssTot += (Y[i] - meanY) ** 2;
  }

  return { rSquared: ssTot > 0 ? 1 - ssRes / ssTot : 0, residuals };
}

/** 从 beta 向量中提取各因子系数 */
function extractFactorCoeffs(
  beta: number[],
  activeFactors: FactorKey[],
): Pick<RegressionResult, 'beta' | 'smb' | 'hml'> {
  const idx = (key: FactorKey) => activeFactors.indexOf(key);
  const coeff = (key: FactorKey) => {
    const i = idx(key);
    return i >= 0 ? beta[i + 1] : 0;
  };
  return { beta: coeff('mktRF'), smb: coeff('smb'), hml: coeff('hml') };
}

/**
 * 执行 Fama-French 因子回归
 * @param input 月度组合收益率
 * @param factors 选择的因子
 * @param startDate 开始日期
 * @param endDate 结束日期
 */
export function runFFRegression(
  input: RegressionInput,
  factors: string[],
  startDate?: string,
  endDate?: string,
): RegressionResult {
  const aligned = alignFactorData(input, startDate, endDate);

  if (aligned.length < 3) {
    return { alpha: 0, beta: 0, smb: 0, hml: 0, rSquared: 0, residuals: [] };
  }

  const activeFactors = (['mktRF', 'smb', 'hml'] as FactorKey[]).filter((f) => factors.includes(f));
  const { X, Y } = buildDesignMatrix(aligned, activeFactors);

  // OLS：beta = (X'X)^{-1} X'Y
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtX_inv = invert2D(XtX);
  const XtY = matMul(Xt, [Y.map((y) => [y])]).map((r) => r[0]);
  const beta = matMul(XtX_inv, [XtY.map((v) => [v])]).map((r) => r[0]);

  const { rSquared, residuals } = computeFitStats(X, Y, beta, activeFactors);
  const coeffs = extractFactorCoeffs(beta, activeFactors);

  return { alpha: beta[0], ...coeffs, rSquared, residuals };
}
