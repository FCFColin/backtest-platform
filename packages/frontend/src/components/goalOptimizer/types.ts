import type { GoalOptimizerResult } from '@backtest/shared/types/goal.js';

export interface GoalAsset {
  ticker: string;
  weight: number;
}

export const tooltipStyle: Record<string, string> = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

export { type GoalOptimizerResult };
