import type { RebalanceFrequency } from './types/portfolio.js';
import type { SignalType } from './types/signal.js';
import type { TechnicalIndicator } from './types/tactical.js';

export const MAX_TICKERS = 50;

export const TRADING_DAYS_PER_YEAR = 252;

export const CHART_COLORS = [
  '#3b82f6', // 蓝 - 主色
  '#8b5cf6', // 紫 - 第二组合
  '#f59e0b', // 琥珀色 - 第三组合
  '#06b6d4', // 青色 - 第四
  '#ec4899', // 粉 - 第五
  '#a3a3a3', // 中灰 - 基准线/参考线
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
