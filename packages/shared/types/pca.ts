// 主成分分析（PCA）类型定义

/** PCA 分析请求 */
export interface PCARequest {
  tickers: string[];
  startDate: string;
  endDate: string;
  numComponents?: number;
}

/** PCA 分析结果 */
export interface PCAResult {
  /** 特征值 */
  eigenvalues: number[];
  /** 累计方差解释率 */
  cumulativeVariance: number[];
  /** 载荷矩阵 */
  loadings: number[][];
  /** 主成分得分 */
  scores: number[][];
  /** 使用的 ticker 列表 */
  tickers: string[];
}
