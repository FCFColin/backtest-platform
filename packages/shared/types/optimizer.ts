// 组合优化与有效前沿类型定义
import type { RebalanceFrequency } from './portfolio.js';

/**
 * 回测优化器目标函数。
 *
 * 用于 /api/v1/backtest-optimizer 端点，对应参数搜索（再平衡频率 / 阈值 / 资金）
 * 中按回测统计指标择优的目标；与有效前沿的目标函数（maxSharpe / minVolatility 等）
 * 语义不同，两者字段集合虽有交集但不可互换。
 */
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

/**
 * 单个回测优化结果项（一组回测参数对应的回测统计指标）。
 *
 * 由回测优化器对每个参数组合（频率 × 阈值 × 资金）计算得到，作为后续过滤与
 * 目标函数择优的输入。
 */
export interface OptimizeResultItem {
  rebalanceFrequency: RebalanceFrequency;
  rebalanceThreshold?: number;
  initialCapital: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  stdev: number;
  calmar: number;
}

/**
 * 最优回测优化结果（在 OptimizeResultItem 基础上附带增长曲线）。
 *
 * 增长曲线用于前端绘制组合净值随时间变化的折线图，与基准曲线叠加展示。
 */
export interface BestResultItem extends OptimizeResultItem {
  growthCurve: Array<{ date: string; value: number }>;
}
