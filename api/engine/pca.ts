/**
 * PCA（主成分分析）核心算法
 *
 * Architecture: PCA计算逻辑，从路由文件外迁
 * 企业为何需要：业务逻辑与HTTP处理耦合导致无法单元测试、无法复用
 * 权衡：增加一层间接调用，但可测试性和可维护性大幅提升
 *
 * 计算流程：
 *   1. 对齐日期后构建价格矩阵
 *   2. 计算日收益率矩阵
 *   3. 标准化收益率（减均值除标准差）
 *   4. 计算协方差矩阵（标准化后即相关系数矩阵）
 *   5. 使用 Jacobi 方法进行特征值分解
 *   6. 按特征值降序排列，返回特征值、载荷矩阵、得分矩阵与累计方差解释率
 */

import type { PCAResult } from '../../shared/types/pca.js';

/**
 * Jacobi 特征值分解算法（适用于对称矩阵）
 *
 * 通过一系列平面旋转（Givens 旋转）将对称矩阵对角化：
 *   A = V · D · Vᵀ
 * 其中 D 为对角阵（特征值），V 的各列为对应特征向量。
 *
 * @param matrix  对称方阵
 * @param maxIter 最大迭代次数
 * @param tol     收敛阈值（非对角元绝对值小于此值即停止）
 * @returns eigenvalues[i] 为第 i 个特征值；eigenvectors[j][i] 为第 i 个特征向量的第 j 个分量
 */
export function jacobiEigen(
  matrix: number[][],
  maxIter: number = 100,
  tol: number = 1e-10,
): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = matrix.length;
  // 拷贝输入矩阵，避免修改原数据
  const A: number[][] = matrix.map((row) => [...row]);
  // V 初始化为单位阵，累积所有旋转即为特征向量矩阵
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  for (let iter = 0; iter < maxIter; iter++) {
    // 寻找绝对值最大的非对角元 A[p][q]
    let maxVal = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const abs = Math.abs(A[i][j]);
        if (abs > maxVal) {
          maxVal = abs;
          p = i;
          q = j;
        }
      }
    }

    // 已收敛（所有非对角元足够小）
    if (maxVal < tol) break;

    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];

    // 计算旋转角度 θ = 0.5 · atan2(2·apq, app - aqq)
    const theta = 0.5 * Math.atan2(2 * apq, app - aqq);
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // 更新对角元 A[p][p]、A[q][q]，并将 A[p][q] 置零
    const newApp = c * c * app + 2 * s * c * apq + s * s * aqq;
    const newAqq = s * s * app - 2 * s * c * apq + c * c * aqq;
    A[p][p] = newApp;
    A[q][q] = newAqq;
    A[p][q] = 0;
    A[q][p] = 0;

    // 更新其余行列中涉及 p、q 的元素（保持对称性）
    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const aip = A[i][p];
        const aiq = A[i][q];
        A[i][p] = c * aip + s * aiq;
        A[p][i] = A[i][p];
        A[i][q] = -s * aip + c * aiq;
        A[q][i] = A[i][q];
      }
    }

    // 累积旋转到 V
    for (let i = 0; i < n; i++) {
      const vip = V[i][p];
      const viq = V[i][q];
      V[i][p] = c * vip + s * viq;
      V[i][q] = -s * vip + c * viq;
    }
  }

  const eigenvalues = A.map((row, i) => row[i]);
  return { eigenvalues, eigenvectors: V };
}

/**
 * 执行 PCA 主成分分析
 *
 * @param tickers      资产代码列表
 * @param priceData    fetchHistoryData 返回的价格数据 { ticker: { date: price } }
 * @param numComponents 保留的主成分数量（可选，默认全部保留）
 * @returns PCAResult
 */
export function performPCA(
  tickers: string[],
  priceData: Record<string, Record<string, number>>,
  numComponents?: number,
): PCAResult {
  // 1. 对齐日期：取所有 ticker 都有数据的日期交集
  const dateSets = tickers.map((t) => {
    const dates = priceData[t] ? Object.keys(priceData[t]) : [];
    return new Set(dates);
  });
  const commonDates = dateSets[0]
    ? Array.from(dateSets[0]).filter((d) => dateSets.every((s) => s.has(d)))
    : [];
  commonDates.sort();

  if (commonDates.length < 2) {
    throw new Error('有效价格数据不足，至少需要 2 个交易日');
  }

  // 2. 构建价格矩阵 prices[dateIdx][tickerIdx]
  const nDates = commonDates.length;
  const nTickers = tickers.length;
  const prices: number[][] = Array.from({ length: nDates }, () => Array(nTickers).fill(0));
  for (let i = 0; i < nDates; i++) {
    const date = commonDates[i];
    for (let j = 0; j < nTickers; j++) {
      prices[i][j] = priceData[tickers[j]][date];
    }
  }

  // 3. 计算日收益率矩阵 returns[i][j]，i = 0..nDates-2
  const nReturns = nDates - 1;
  const returns: number[][] = Array.from({ length: nReturns }, () => Array(nTickers).fill(0));
  for (let i = 0; i < nReturns; i++) {
    for (let j = 0; j < nTickers; j++) {
      const prev = prices[i][j];
      const curr = prices[i + 1][j];
      returns[i][j] = prev !== 0 ? (curr - prev) / prev : 0;
    }
  }

  // 4. 标准化：每列减均值除标准差
  const means = Array(nTickers).fill(0);
  const stds = Array(nTickers).fill(0);
  for (let j = 0; j < nTickers; j++) {
    let sum = 0;
    for (let i = 0; i < nReturns; i++) sum += returns[i][j];
    means[j] = sum / nReturns;
    let varSum = 0;
    for (let i = 0; i < nReturns; i++) {
      const diff = returns[i][j] - means[j];
      varSum += diff * diff;
    }
    // 样本标准差（分母 n-1）；方差为 0 时置为 1 避免除零
    stds[j] = nReturns > 1 ? Math.sqrt(varSum / (nReturns - 1)) : 0;
    if (stds[j] === 0) stds[j] = 1;
  }

  const stdReturns: number[][] = Array.from({ length: nReturns }, () => Array(nTickers).fill(0));
  for (let i = 0; i < nReturns; i++) {
    for (let j = 0; j < nTickers; j++) {
      stdReturns[i][j] = (returns[i][j] - means[j]) / stds[j];
    }
  }

  // 5. 计算协方差矩阵 C[j][k] = Σ stdReturns[i][j]·stdReturns[i][k] / (n-1)
  //    标准化后等价于相关系数矩阵
  const cov: number[][] = Array.from({ length: nTickers }, () => Array(nTickers).fill(0));
  for (let j = 0; j < nTickers; j++) {
    for (let k = 0; k < nTickers; k++) {
      let sum = 0;
      for (let i = 0; i < nReturns; i++) {
        sum += stdReturns[i][j] * stdReturns[i][k];
      }
      cov[j][k] = nReturns > 1 ? sum / (nReturns - 1) : 0;
    }
  }

  // 6. Jacobi 特征值分解
  const { eigenvalues: rawEigenvalues, eigenvectors: rawEigenvectors } = jacobiEigen(cov);

  // 7. 按特征值降序排列
  const order = rawEigenvalues
    .map((val, idx) => ({ val, idx }))
    .sort((a, b) => b.val - a.val);

  const sortedEigenvalues = order.map((o) => o.val);
  // 载荷矩阵 loadings[tickerIdx][componentIdx] = 特征向量分量
  const sortedEigenvectors: number[][] = Array.from({ length: nTickers }, () =>
    Array(nTickers).fill(0),
  );
  for (let compIdx = 0; compIdx < nTickers; compIdx++) {
    const srcIdx = order[compIdx].idx;
    for (let tickerIdx = 0; tickerIdx < nTickers; tickerIdx++) {
      sortedEigenvectors[tickerIdx][compIdx] = rawEigenvectors[tickerIdx][srcIdx];
    }
  }

  // 8. 计算累计方差解释率
  const totalVar = sortedEigenvalues.reduce((s, v) => s + Math.max(v, 0), 0);
  const cumulativeVariance: number[] = [];
  let cumSum = 0;
  for (const val of sortedEigenvalues) {
    cumSum += Math.max(val, 0);
    cumulativeVariance.push(totalVar > 0 ? cumSum / totalVar : 0);
  }

  // 9. 计算主成分得分 scores[dateIdx][componentIdx] = Σ stdReturns[dateIdx][tickerIdx] · loadings[tickerIdx][componentIdx]
  const scores: number[][] = Array.from({ length: nReturns }, () => Array(nTickers).fill(0));
  for (let i = 0; i < nReturns; i++) {
    for (let compIdx = 0; compIdx < nTickers; compIdx++) {
      let sum = 0;
      for (let j = 0; j < nTickers; j++) {
        sum += stdReturns[i][j] * sortedEigenvectors[j][compIdx];
      }
      scores[i][compIdx] = sum;
    }
  }

  // 10. 按需截断主成分数量
  const keep = numComponents && numComponents > 0 ? Math.min(numComponents, nTickers) : nTickers;

  return {
    eigenvalues: sortedEigenvalues.slice(0, keep),
    cumulativeVariance: cumulativeVariance.slice(0, keep),
    loadings: sortedEigenvectors.map((row) => row.slice(0, keep)),
    scores: scores.map((row) => row.slice(0, keep)),
    tickers,
  };
}
