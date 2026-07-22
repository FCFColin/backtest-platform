/**
 * 蒙特卡洛模拟类型定义
 *
 * 使用区块自举（Block Bootstrap）方法生成多条随机路径，
 * 评估组合在不确定性下的概率分布。所有路径共享同样的时间刻度。
 */

/** 单条模拟路径的关键统计指标 */
export interface PerPathMetrics {
  finalValue: number;
  cagr: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  sortino: number;
}

/**
 * 蒙特卡洛模拟结果
 *
 * percentiles：各百分位的净值路径，长度 = numYears * 252（交易日）。
 * successProbability：每个时间点的成功率（净值 > 0 的路径占比）。
 * representativePaths：从所有路径中选出的 5 条代表性路径。
 * successProbabilities 细分为生存率、保本率和盈利率的时序。
 */
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
