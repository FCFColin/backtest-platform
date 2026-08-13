import type { RebalanceFrequency } from './types/portfolio.js';
import type { SignalType } from './types/signal.js';
import type { TechnicalIndicator } from './types/tactical.js';

export const MAX_TICKERS = 50;

export const MAX_PORTFOLIOS = MAX_TICKERS;

export const TRADING_DAYS_PER_YEAR = 252;

/** 图表序列色板唯一事实源（chart-1..8），暗色模式经 CSS 变量自动切换 */
export const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
  'hsl(var(--chart-8))',
] as const;

export const ALL_REBALANCE_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'none',
  'threshold',
] as const satisfies readonly RebalanceFrequency[];

export const REBALANCE_FREQUENCIES = ALL_REBALANCE_FREQUENCIES.slice(0, 5);

export const TECHNICAL_INDICATORS = [
  'sma',
  'ema',
  'rsi',
  'macd',
  'bollinger',
  'momentum',
] as const satisfies readonly TechnicalIndicator[];

export const SIGNAL_TYPES = ['entry', 'exit', 'both'] as const satisfies readonly SignalType[];

export const REBALANCE_FREQUENCY_COLORS: Record<RebalanceFrequency, string> = {
  daily: 'hsl(var(--rebalance-daily))',
  weekly: 'hsl(var(--rebalance-weekly))',
  monthly: 'hsl(var(--rebalance-monthly))',
  quarterly: 'hsl(var(--rebalance-quarterly))',
  annual: 'hsl(var(--rebalance-annual))',
  none: 'hsl(var(--rebalance-none))',
  threshold: 'hsl(var(--rebalance-threshold))',
};

export const REBALANCE_LABELS: Record<RebalanceFrequency, string> = {
  none: 'monteCarlo.params.rebalanceNone',
  annual: 'Annual',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
  weekly: 'Weekly',
  daily: 'Daily',
  threshold: 'Threshold',
};

export const REBALANCE_FREQUENCY_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> =
  REBALANCE_FREQUENCIES.map((value) => ({ value, label: REBALANCE_LABELS[value] }));
