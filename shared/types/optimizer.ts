// 组合优化与有效前沿类型定义

export type OptimizationObjective = 'maxSharpe' | 'minVolatility' | 'maxReturn' | 'maxSortino';

export interface OptimizationResult {
  optimalWeights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
}

export interface EfficientFrontierPoint {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
}

export interface EfficientFrontierResult {
  frontier: EfficientFrontierPoint[];
}
