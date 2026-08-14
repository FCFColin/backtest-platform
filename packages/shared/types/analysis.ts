import type { RebalanceFrequency } from './portfolio.js';
import type { Statistics } from './statistics.js';

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

export interface LETFRequest {
  letfTicker: string;
  benchmarkTicker: string;
  leverage: number;
  startDate: string;
  endDate: string;
}
export interface LETFResult {
  slippageCurve: Array<{ date: string; slippage: number }>;
  annualDecay: number;
  effectiveLeverage: (number | null)[];
  stats: { benchmarkReturn: number; letfReturn: number; expectedReturn: number; slippage: number };
}

export interface GoalOptimizerRequest {
  targetAmount: number;
  initialAmount: number;
  years: number;
  assets: Array<{ ticker: string; weight: number }>;
  constraints?: { maxDrawdown?: number; maxVolatility?: number };
  numSimulations?: number;
}
export interface GoalOptimizerResult {
  successProbability: number;
  probabilityCurve: Array<{ amount: number; probability: number }>;
  optimalPath: Array<{ year: number; median: number; p10: number; p90: number }>;
  recommendation: { expectedReturn: number; requiredContribution: number; successRate: number };
}

export interface MarketStats {
  generated_at: string;
  total_cached: number;
  by_market: Record<string, { count: number; stocks: number; etfs: number; indices: number }>;
  by_type: Record<string, number>;
  by_exchange: Record<string, number>;
  date_ranges: { earliest: string | null; latest: string | null };
  by_decade: Record<string, number>;
  by_year_count: Record<string, number>;
  coverage: {
    tickers_with_5y_plus: number;
    tickers_with_10y_plus: number;
    tickers_with_20y_plus: number;
    avg_data_points: number;
    median_data_points: number;
  };
  data_quality: {
    with_adj_close: number;
    with_dividends: number;
    with_splits: number;
    total_data_points: number;
    total_size_mb: number;
  };
  recent_updates: Array<{ ticker: string; name: string; updated: string }>;
  sample_tickers: Record<
    string,
    Array<{
      ticker: string;
      name: string;
      first_date: string;
      last_date: string;
      data_points: number;
    }>
  >;
}

export interface PerPathMetrics {
  finalValue: number;
  cagr: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  sortino: number;
}
export interface MonteCarloResult {
  percentiles: {
    p5: number[];
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
    p95: number[];
  };
  successProbability: number[];
  finalDistribution: number[];
  statistics: { medianFinalValue: number; meanFinalValue: number; successRate: number };
  perPathMetrics: PerPathMetrics[];
  representativePaths: {
    best: number[];
    p25: number[];
    median: number[];
    p75: number[];
    worst: number[];
  };
  successProbabilities: { survival: number[]; capitalPreservation: number[]; profit: number[] };
}

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
