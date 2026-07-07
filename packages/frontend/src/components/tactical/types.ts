/**
 * @file Tactical page shared types, constants, and factory functions
 */
import type { RebalanceFrequency, PortfolioResult } from '@backtest/shared';
import type {
  TacticalStrategy,
  TradingSignal,
  SignalCondition,
  TechnicalIndicator,
  EmailAlertConfig,
} from '@backtest/shared/types/tactical';

export const INDICATOR_OPTIONS: Array<{ value: TechnicalIndicator; label: string }> = [
  { value: 'sma', label: 'SMA 简单均线' },
  { value: 'ema', label: 'EMA 指数均线' },
  { value: 'rsi', label: 'RSI 相对强弱' },
  { value: 'macd', label: 'MACD' },
  { value: 'bollinger', label: 'Bollinger 布林带' },
  { value: 'momentum', label: 'Momentum 动量' },
];

export const OPERATOR_OPTIONS: Array<{ value: SignalCondition['operator']; label: string }> = [
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'cross_above', label: '交叉上穿' },
  { value: 'cross_below', label: '交叉下穿' },
];

export const REBALANCE_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季' },
  { value: 'annual', label: '每年' },
  { value: 'none', label: '不调仓' },
];

export const AGGREGATION_OPTIONS: Array<{
  value: TacticalStrategy['aggregationMethod'];
  label: string;
}> = [
  { value: 'voting', label: '投票' },
  { value: 'weighted_average', label: '加权平均' },
  { value: 'rank', label: '排名' },
];

export const RANKING_METHOD_OPTIONS: Array<{
  value: 'fixed_share' | 'risk_parity';
  label: string;
}> = [
  { value: 'fixed_share', label: '固定份额' },
  { value: 'risk_parity', label: '风险平价' },
];

export const ALERT_TRIGGER_OPTIONS: Array<{
  value: EmailAlertConfig['triggers'][number];
  label: string;
  desc: string;
}> = [
  { value: 'signal_change', label: '信号变化', desc: '当激活信号发生切换时触发' },
  { value: 'rebalance', label: '再平衡', desc: '每次再平衡调仓时触发' },
  { value: 'threshold', label: '阈值触发', desc: '指标突破设定阈值时触发' },
];

export const TABS = [
  { key: 'backtest', label: '回测结果' },
  { key: 'whatif', label: 'What If' },
  { key: 'alerts', label: '邮件告警' },
];

export interface BacktestResponse {
  portfolio: PortfolioResult;
  benchmark: PortfolioResult;
  signalHistory: Array<{
    date: string;
    activeSignals: string[];
    weights: Array<{ ticker: string; weight: number }>;
  }>;
}

export interface StatRow {
  metric: string;
  tactical: string;
  benchmark: string;
  _sortTactical: number;
}

export const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

export const signalHistoryThStyle = {
  color: 'var(--text-muted)',
  borderBottom: '2px solid var(--border-soft)',
};

export const signalHistoryTdStyle = {
  color: 'var(--text-body)',
  borderBottom: '1px solid var(--border-soft)',
};

export const signalEditorStyle = {
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  padding: 12,
  marginBottom: 12,
  background: 'var(--bg-subtle)',
};

export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export function createDefaultCondition(): SignalCondition {
  return { indicator: 'sma', period: 20, operator: 'gt', threshold: 0 };
}

export function createDefaultSignal(): TradingSignal {
  return {
    id: genId('signal'),
    name: '信号 1',
    conditions: [createDefaultCondition()],
    targetWeights: [
      { ticker: 'SPY', weight: 60 },
      { ticker: 'TLT', weight: 40 },
    ],
  };
}

export function createDefaultStrategy(): TacticalStrategy {
  return {
    id: genId('strategy'),
    name: '战术策略',
    signals: [createDefaultSignal()],
    aggregationMethod: 'voting',
    rankingConfig: { method: 'fixed_share', topN: 3 },
  };
}
