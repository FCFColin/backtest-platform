import type { Statistics } from '@backtest/shared';
export type FmtType = 'pct' | 'ratio' | 'num';
export interface StatRow {
  key: keyof Statistics;
  label: string;
  fmt: FmtType;
  description?: string;
  colorize?: boolean;
}
export const STAT_KEY_TO_TESTID: Record<string, string> = {
  cagr: 'stat-cagr',
  mwrr: 'stat-mwrr',
  maxDrawdown: 'stat-max-drawdown',
  avgDrawdown: 'stat-avg-drawdown',
  sharpe: 'stat-sharpe',
  sortino: 'stat-sortino',
  calmar: 'stat-calmar',
  ulcerIndex: 'stat-ulcer',
  diversificationRatio: 'stat-diversification',
  beta: 'stat-beta',
  stdev: 'stat-volatility',
  ulcerPerformanceIndex: 'stat-upi',
};
