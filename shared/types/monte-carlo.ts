// 蒙特卡洛模拟类型定义

export interface MonteCarloParameters {
  numYears: number;
  numSimulations: number;
  minBlockYears: number;
  maxBlockYears: number;
  withReplacement: boolean;
  seed?: number;
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
  statistics: {
    medianFinalValue: number;
    meanFinalValue: number;
    successRate: number;
  };
  perPathMetrics: PerPathMetrics[];
  representativePaths: {
    best: number[];
    p25: number[];
    median: number[];
    p75: number[];
    worst: number[];
  };
  successProbabilities: {
    survival: number[];
    capitalPreservation: number[];
    profit: number[];
  };
}
