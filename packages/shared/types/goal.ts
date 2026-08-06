// 目标优化（Goal Optimizer）类型定义

export interface GoalOptimizerRequest {
  targetAmount: number;
  initialAmount: number;
  years: number;
  assets: Array<{ ticker: string; weight: number }>;
  constraints?: {
    maxDrawdown?: number;
    minSuccessRate?: number;
    maxVolatility?: number;
  };
  numSimulations?: number;
}

export interface GoalOptimizerResult {
  successProbability: number;
  probabilityCurve: Array<{ amount: number; probability: number }>;
  optimalPath: Array<{ year: number; median: number; p10: number; p90: number }>;
  recommendation: {
    expectedReturn: number;
    requiredContribution: number;
    successRate: number;
  };
}
