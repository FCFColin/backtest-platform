/**
 * 蒙特卡洛模拟类型定义
 *
 * 使用区块自举（Block Bootstrap）方法生成多条随机路径，
 * 评估组合在不确定性下的概率分布。所有路径共享同样的时间刻度。
 */

/**
 * 蒙特卡洛模拟参数
 *
 * 区块自举（Block Bootstrap）将历史收益序列划分为 minBlockYears~maxBlockYears
 * 大小的随机区块并拼接，比逐日采样更好地保留收益的自相关结构。
 *
 * withReplacement=true 时区块可重复采样（标准 Bootstrap），
 * withReplacement=false 时每个区块最多使用一次，保证样本覆盖（非标准）。
 *
 * seed 提供可重现的随机数序列，用于调试和回归测试。
 */
export interface MonteCarloParameters {
  numYears: number;
  numSimulations: number;
  minBlockYears: number;
  maxBlockYears: number;
  withReplacement: boolean;
  seed?: number;
}

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
