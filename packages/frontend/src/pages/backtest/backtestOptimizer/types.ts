import type { Objective, OptimizeResultItem, BestResultItem, BacktestOptimizerState } from '../backtestOptimizerUtils.js';
export type { Objective, OptimizeResultItem, BestResultItem, BacktestOptimizerState };
export interface GrowthPoint {
  date: string;
  value: number;
}
export interface OptimizerSectionProps {
  s: BacktestOptimizerState;
}
export interface BestMetricsCardProps {
  best: BestResultItem | null;
  totalCombos: number;
}
export interface GrowthComparisonChartProps {
  best: BestResultItem | null;
  benchmarkGrowth: GrowthPoint[] | null;
}
export interface ComparisonTableSectionProps {
  results: OptimizeResultItem[];
  objective: Objective;
}
export interface ConstraintRowProps {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  label: string;
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
}
