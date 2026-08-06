import type { RebalanceFrequency } from './portfolio.js';
import type { Statistics } from './statistics.js';

export type BacktestOptimizerObjective = 'maxCagr' | 'minMaxDrawdown' | 'maxSharpe' | 'maxSortino';

export interface EfficientFrontierPoint {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
}

export interface OptimizationResult extends EfficientFrontierPoint {
  optimalWeights: Record<string, number>;
}

export interface EfficientFrontierResult {
  frontier: EfficientFrontierPoint[];
}

export interface OptimizeResultItem extends Pick<
  Statistics,
  'cagr' | 'maxDrawdown' | 'sharpe' | 'sortino' | 'stdev' | 'calmar'
> {
  rebalanceFrequency: RebalanceFrequency;
  rebalanceThreshold?: number;
  initialCapital: number;
}

export interface BestResultItem extends OptimizeResultItem {
  growthCurve: Array<{ date: string; value: number }>;
}
