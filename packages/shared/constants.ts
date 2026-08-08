import type { RebalanceFrequency } from './types/portfolio.js';
import type { SignalType } from './types/signal.js';
import type { TechnicalIndicator } from './types/tactical.js';

export const MAX_TICKERS = 50;

export const TRADING_DAYS_PER_YEAR = 252;

/** 图表序列色板：与前端 chart-theme 的 PORTFOLIO_COLORS 同序，暗色模式经 CSS 变量自动切换 */
export const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--fg-tertiary))',
] as const;

export const REBALANCE_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
] as const satisfies readonly RebalanceFrequency[];

export const ALL_REBALANCE_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'none',
  'threshold',
] as const satisfies readonly RebalanceFrequency[];

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
  daily: '#2b63b8',
  weekly: '#06b6d4',
  monthly: '#2e8b57',
  quarterly: '#f97316',
  annual: '#c94a4a',
  none: '#94a3b8',
  threshold: '#a855f7',
};

export const REBALANCE_LABELS: Record<RebalanceFrequency, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  annual: '每年',
  none: '不调仓',
  threshold: '阈值',
};

export const REBALANCE_FREQUENCY_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> =
  REBALANCE_FREQUENCIES.map((value) => ({ value, label: REBALANCE_LABELS[value] }));
