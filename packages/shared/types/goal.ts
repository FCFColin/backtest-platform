// 目标优化（Goal Optimizer）类型定义

/** 目标优化请求 */
export interface GoalOptimizerRequest {
  /** 目标金额 */
  targetAmount: number;
  /** 初始金额 */
  initialAmount: number;
  /** 时间范围（年） */
  years: number;
  /** 资产列表 */
  assets: Array<{ ticker: string; weight: number }>;
  /** 约束条件 */
  constraints?: {
    maxDrawdown?: number;
    minSuccessRate?: number;
    maxVolatility?: number;
  };
  /** 模拟次数 */
  numSimulations?: number;
}

/** 目标优化结果 */
export interface GoalOptimizerResult {
  /** 成功概率分布 */
  successProbability: number;
  /** 概率分布曲线 */
  probabilityCurve: Array<{ amount: number; probability: number }>;
  /** 最优路径 */
  optimalPath: Array<{ year: number; median: number; p10: number; p90: number }>;
  /** 建议配置 */
  recommendation: {
    expectedReturn: number;
    requiredContribution: number;
    successRate: number;
  };
}
