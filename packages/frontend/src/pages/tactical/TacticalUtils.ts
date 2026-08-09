import { useState } from 'react';
import { useAsyncAction } from '../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../i18n/index.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import {
  type PortfolioResult,
  type RebalanceFrequency,
  REBALANCE_FREQUENCIES,
} from '@backtest/shared';
import type {
  TacticalStrategy,
  TradingSignal,
  SignalCondition,
  TechnicalIndicator,
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
  { value: 'none', label: 'monteCarlo.params.rebalanceNone' },
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
  { value: 'voting', label: 'signal.multi.aggregationVoting' },
  { value: 'weighted_average', label: 'signal.multi.aggregationWeighted' },
  { value: 'rank', label: 'signal.multi.aggregationRank' },
];
interface BacktestResponse {
  portfolio: PortfolioResult;
  benchmark: PortfolioResult;
  signalHistory: Array<{
    date: string;
    activeSignals: string[];
    weights: Array<{ ticker: string; weight: number }>;
  }>;
}
const RANKING_METHOD_OPTIONS: Array<{ value: 'fixed_share' | 'risk_parity'; label: string }> = [
  { value: 'fixed_share', label: 'tactical.rankingMethod.fixed_share' },
  { value: 'risk_parity', label: 'tactical.rankingMethod.risk_parity' },
];
const TABS = [
  { key: 'backtest', label: 'tactical.tabs.backtest' },
  { key: 'whatif', label: 'tactical.tabs.whatif' },
];
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}
function createDefaultCondition(): SignalCondition {
  return { indicator: 'sma', period: 20, operator: 'gt', threshold: 0 };
}
function createDefaultSignal(): TradingSignal {
  return {
    id: genId('signal'),
    name: i18n.t('Signal {{index}}', { index: 1 }),
    conditions: [createDefaultCondition()],
    targetWeights: [
      { ticker: 'SPY', weight: 60 },
      { ticker: 'TLT', weight: 40 },
    ],
  };
}
function createDefaultStrategy(): TacticalStrategy {
  return {
    id: genId('strategy'),
    name: i18n.t('Tactical Strategy'),
    signals: [createDefaultSignal()],
    aggregationMethod: 'voting',
    rankingConfig: { method: 'fixed_share', topN: 3 },
  };
}
function validateStrategy(signals: TradingSignal[]): string | null {
  for (const sig of signals) {
    if (sig.conditions.length === 0)
      return i18n.t('Signal "{{name}}" is missing trigger conditions', { name: sig.name });
    const validWeights = sig.targetWeights.filter((w) => w.ticker && w.weight > 0);
    if (validWeights.length === 0)
      return i18n.t('Signal "{{name}}" is missing valid target weights', { name: sig.name });
  }
  return null;
}
function useTacticalPageState() {
  const [strategy, setStrategy] = useState<TacticalStrategy>(createDefaultStrategy);
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [startingValue, setStartingValue] = useState(10000);
  const [rebalanceFrequency, setRebalanceFrequency] = useState<RebalanceFrequency>('monthly');
  const [activeTab, setActiveTab] = useState('backtest');
  const [results, setResults] = useState<BacktestResponse | null>(null);
  const { isLoading, error, run, setError } = useAsyncAction();
  const updateSignal = (idx: number, signal: TradingSignal) => {
    const next = [...strategy.signals];
    next[idx] = signal;
    setStrategy({ ...strategy, signals: next });
  };
  const addSignal = () => {
    const newSignal = createDefaultSignal();
    newSignal.name = i18n.t('Signal {{index}}', { index: strategy.signals.length + 1 });
    setStrategy({ ...strategy, signals: [...strategy.signals, newSignal] });
  };
  const removeSignal = (idx: number) => {
    if (strategy.signals.length <= 1) return;
    setStrategy({ ...strategy, signals: strategy.signals.filter((_, i) => i !== idx) });
  };
  const handleRunBacktest = () => {
    const validationError = validateStrategy(strategy.signals);
    if (validationError) {
      setError(validationError);
      return;
    }
    run(async () => {
      const data = await apiPostJSON<BacktestResponse>(
        '/api/v1/tactical/backtest',
        { strategy, startDate, endDate, startingValue, rebalanceFrequency },
        i18n.t('errors.backtestFailed'),
      );
      setResults(data);
      setActiveTab('backtest');
    });
  };
  return {
    strategy,
    setStrategy,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startingValue,
    setStartingValue,
    rebalanceFrequency,
    setRebalanceFrequency,
    activeTab,
    setActiveTab,
    results,
    isLoading,
    error,
    updateSignal,
    addSignal,
    removeSignal,
    handleRunBacktest,
  };
}
export { RANKING_METHOD_OPTIONS, TABS, createDefaultCondition, useTacticalPageState };
export type { BacktestResponse };
