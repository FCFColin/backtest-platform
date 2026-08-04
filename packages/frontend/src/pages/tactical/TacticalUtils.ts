import { useState } from 'react';
import { useAsyncAction } from '../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../i18n/index.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { type PortfolioResult, type RebalanceFrequency } from '@backtest/shared';
import type {
  TacticalStrategy,
  TradingSignal,
  SignalCondition,
} from '@backtest/shared/types/tactical';
import {
  INDICATOR_OPTIONS,
  OPERATOR_OPTIONS,
  REBALANCE_OPTIONS,
  AGGREGATION_OPTIONS,
} from './sharedTacticalConstants.js';
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
    name: i18n.t('tactical.defaultSignalName', { index: 1 }),
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
    name: i18n.t('tactical.defaultStrategyName'),
    signals: [createDefaultSignal()],
    aggregationMethod: 'voting',
    rankingConfig: { method: 'fixed_share', topN: 3 },
  };
}
function validateStrategy(signals: TradingSignal[]): string | null {
  for (const sig of signals) {
    if (sig.conditions.length === 0)
      return i18n.t('tactical.validateErrors.missingConditions', { name: sig.name });
    const validWeights = sig.targetWeights.filter((w) => w.ticker && w.weight > 0);
    if (validWeights.length === 0)
      return i18n.t('tactical.validateErrors.missingWeights', { name: sig.name });
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
    newSignal.name = i18n.t('tactical.defaultSignalName', { index: strategy.signals.length + 1 });
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
        i18n.t('tactical.results.backtestFailed'),
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
export {
  INDICATOR_OPTIONS,
  OPERATOR_OPTIONS,
  REBALANCE_OPTIONS,
  AGGREGATION_OPTIONS,
  RANKING_METHOD_OPTIONS,
  TABS,
  createDefaultCondition,
  useTacticalPageState,
};
export type { BacktestResponse };
