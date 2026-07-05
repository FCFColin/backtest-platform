import type { CSSProperties } from 'react';
import type { RebalanceFrequency } from '@backtest/shared/types';

export type IndicatorType = 'sma' | 'ema' | 'rsi';
export type ObjectiveType = 'maxCAGR' | 'minDrawdown' | 'maxSharpe';

export const INDICATOR_OPTIONS: Array<{ value: IndicatorType; label: string }> = [
  { value: 'sma', label: 'SMA 简单均线' },
  { value: 'ema', label: 'EMA 指数均线' },
  { value: 'rsi', label: 'RSI 相对强弱' },
];

export const REBALANCE_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季' },
  { value: 'annual', label: '每年' },
];

export const OBJECTIVE_OPTIONS: Array<{ value: ObjectiveType; label: string }> = [
  { value: 'maxCAGR', label: '最大化 CAGR（年化收益）' },
  { value: 'minDrawdown', label: '最小化最大回撤' },
  { value: 'maxSharpe', label: '最大化 Sharpe（夏普比率）' },
];

export const tooltipStyle: CSSProperties = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

export const heatmapCellStyle: CSSProperties = {
  padding: '6px 8px',
  textAlign: 'center',
  borderBottom: '1px solid var(--border-soft)',
  borderRight: '1px solid var(--border-soft)',
  fontSize: 11,
};

export const heatmapHeaderStyle: CSSProperties = {
  padding: '6px 8px',
  color: 'var(--text-muted)',
  borderBottom: '2px solid var(--border-soft)',
  borderRight: '1px solid var(--border-soft)',
  fontSize: 11,
  fontWeight: 600,
  position: 'sticky',
  top: 0,
  background: 'var(--bg-elevated)',
  zIndex: 1,
};

export const heatmapRowHeaderStyle: CSSProperties = {
  padding: '6px 8px',
  color: 'var(--text-strong)',
  fontWeight: 600,
  borderBottom: '1px solid var(--border-soft)',
  borderRight: '1px solid var(--border-soft)',
  background: 'var(--bg-subtle)',
  fontSize: 11,
};

export interface ParamRange {
  min: number;
  max: number;
  step: number;
}

export interface GridCombinationMetrics {
  param1: number;
  param2: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  totalReturn: number;
  stdev: number;
  calmar: number;
}

export interface TopCombinationResult extends GridCombinationMetrics {
  growthCurve: Array<{ date: string; value: number }>;
}

export interface HeatmapData {
  param1Label: string;
  param2Label: string;
  param1Values: number[];
  param2Values: number[];
  matrix: (number | null)[][];
  objective: ObjectiveType;
}

export interface TacticalGridResponse {
  totalCombinations: number;
  allMetrics: GridCombinationMetrics[];
  topResults: TopCombinationResult[];
  heatmap: HeatmapData;
  bestCombination: TopCombinationResult;
}
