// 主成分分析（PCA）类型定义

export interface PCARequest {
  tickers: string[];
  startDate: string;
  endDate: string;
  numComponents?: number;
}

export interface PCAResult {
  eigenvalues: number[];
  cumulativeVariance: number[];
  loadings: number[][];
  scores: number[][];
  tickers: string[];
}
