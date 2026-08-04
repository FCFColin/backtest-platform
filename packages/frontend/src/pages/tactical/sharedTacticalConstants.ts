import { REBALANCE_FREQUENCIES, type RebalanceFrequency } from '@backtest/shared';
import type {
  TechnicalIndicator,
  SignalCondition,
  TacticalStrategy,
} from '@backtest/shared/types/tactical';
export const INDICATOR_OPTIONS: Array<{
  value: TechnicalIndicator;
  label: string;
  description?: string;
}> = [
  { value: 'sma', label: 'tactical.indicators.sma' },
  { value: 'ema', label: 'tactical.indicators.ema' },
  { value: 'rsi', label: 'tactical.indicators.rsi' },
  { value: 'macd', label: 'tactical.indicators.macd' },
  {
    value: 'bollinger',
    label: 'tactical.indicators.bollinger',
    description: 'tactical.indicators.bollingerDesc',
  },
  { value: 'momentum', label: 'tactical.indicators.momentum' },
];
export const REBALANCE_OPTIONS: Array<{ value: RebalanceFrequency | 'none'; label: string }> = [
  ...REBALANCE_FREQUENCIES.map((value) => ({ value, label: `tactical.rebalanceOptions.${value}` })),
  { value: 'none', label: 'tactical.rebalanceOptions.none' },
];
export const OPERATOR_OPTIONS: Array<{ value: SignalCondition['operator']; label: string }> = [
  { value: 'gt', label: 'tactical.operators.gt' },
  { value: 'lt', label: 'tactical.operators.lt' },
  { value: 'cross_above', label: 'tactical.operators.cross_above' },
  { value: 'cross_below', label: 'tactical.operators.cross_below' },
];
export const AGGREGATION_OPTIONS: Array<{
  value: TacticalStrategy['aggregationMethod'];
  label: string;
}> = [
  { value: 'voting', label: 'tactical.aggregation.voting' },
  { value: 'weighted_average', label: 'tactical.aggregation.weighted_average' },
  { value: 'rank', label: 'tactical.aggregation.rank' },
];
