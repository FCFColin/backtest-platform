/**
 * @file 回测优化器组件共享类型
 * @description 集中存放各拆分组件共享的 props 类型，避免循环依赖与重复定义。
 *              底层领域类型（BacktestOptimizerState/Objective/...）仍由 backtestOptimizerUtils.ts
 *              作为唯一来源导出，本文件仅做 re-export 并补充组件 props 契约。
 */
import type {
  Objective,
  OptimizeResultItem,
  BestResultItem,
  BacktestOptimizerState,
} from '../backtestOptimizerUtils.js';

export type { Objective, OptimizeResultItem, BestResultItem, BacktestOptimizerState };

/** 增长曲线数据点 */
export interface GrowthPoint {
  date: string;
  value: number;
}

/** 配置类 Section 共用 props：注入优化器状态 */
export interface OptimizerSectionProps {
  s: BacktestOptimizerState;
}

/** BestMetricsCard props */
export interface BestMetricsCardProps {
  best: BestResultItem | null;
  totalCombos: number;
}

/** GrowthComparisonChart props */
export interface GrowthComparisonChartProps {
  best: BestResultItem | null;
  benchmarkGrowth: GrowthPoint[] | null;
}

/** ComparisonTableSection props */
export interface ComparisonTableSectionProps {
  results: OptimizeResultItem[];
  objective: Objective;
}

/** ConstraintRow props（ObjectiveSection 内部使用） */
export interface ConstraintRowProps {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  label: string;
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
}
