import type { Statistics } from '@backtest/shared';
export type FmtType = 'pct' | 'ratio' | 'num' | 'int' | 'duration';
export type MetricImportance = 'primary' | 'secondary' | 'detailed';
export interface StatRow {
  key: keyof Statistics;
  label: string;
  fmt: FmtType;
  importance?: MetricImportance;
  higherIsBetter?: boolean;
  description?: string;
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
  endingValue: 'stat-ending-value',
  volatility: 'stat-volatility',
  upi: 'stat-upi',
};
