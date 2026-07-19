import { useState } from 'react';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../i18n/index.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import type { RebalanceFrequency, PortfolioResult } from '@backtest/shared';
import { REBALANCE_FREQUENCIES } from '@backtest/shared';
import type {
  TacticalStrategy,
  TradingSignal,
  SignalCondition,
  TechnicalIndicator,
  EmailAlertConfig,
} from '@backtest/shared/types/tactical';

interface BacktestResponse {
  portfolio: PortfolioResult;
  benchmark: PortfolioResult;
  signalHistory: Array<{
    date: string;
    activeSignals: string[];
    weights: Array<{ ticker: string; weight: number }>;
  }>;
}

// 所有 OPTIONS 的 label 字段为 i18n key（形如 'tactical.indicators.sma'），
// 调用方需通过 useTranslation() 的 t() 函数翻译后再展示。
// 这样 .ts 文件不含中文字面量，.tsx 调用方在渲染时 t(o.label) 即可随语言切换。

const INDICATOR_OPTIONS: Array<{
  value: TechnicalIndicator;
  label: string;
}> = [
  { value: 'sma', label: 'tactical.indicators.sma' },
  { value: 'ema', label: 'tactical.indicators.ema' },
  { value: 'rsi', label: 'tactical.indicators.rsi' },
  { value: 'macd', label: 'tactical.indicators.macd' },
  { value: 'bollinger', label: 'tactical.indicators.bollinger' },
  { value: 'momentum', label: 'tactical.indicators.momentum' },
];

const OPERATOR_OPTIONS: Array<{ value: SignalCondition['operator']; label: string }> = [
  { value: 'gt', label: 'tactical.operators.gt' },
  { value: 'lt', label: 'tactical.operators.lt' },
  { value: 'cross_above', label: 'tactical.operators.cross_above' },
  { value: 'cross_below', label: 'tactical.operators.cross_below' },
];

const REBALANCE_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> = [
  ...REBALANCE_FREQUENCIES.map((value) => ({
    value,
    label: `tactical.rebalanceOptions.${value}`,
  })),
  { value: 'none', label: 'tactical.rebalanceOptions.none' },
];

const AGGREGATION_OPTIONS: Array<{ value: TacticalStrategy['aggregationMethod']; label: string }> =
  [
    { value: 'voting', label: 'tactical.aggregation.voting' },
    { value: 'weighted_average', label: 'tactical.aggregation.weighted_average' },
    { value: 'rank', label: 'tactical.aggregation.rank' },
  ];

const RANKING_METHOD_OPTIONS: Array<{ value: 'fixed_share' | 'risk_parity'; label: string }> = [
  { value: 'fixed_share', label: 'tactical.rankingMethod.fixed_share' },
  { value: 'risk_parity', label: 'tactical.rankingMethod.risk_parity' },
];

const ALERT_TRIGGER_OPTIONS: Array<{
  value: EmailAlertConfig['triggers'][number];
  label: string;
  desc: string;
}> = [
  {
    value: 'signal_change',
    label: 'tactical.alertTrigger.signal_change',
    desc: 'tactical.alertTriggerDesc.signal_change',
  },
  {
    value: 'rebalance',
    label: 'tactical.alertTrigger.rebalance',
    desc: 'tactical.alertTriggerDesc.rebalance',
  },
  {
    value: 'threshold',
    label: 'tactical.alertTrigger.threshold',
    desc: 'tactical.alertTriggerDesc.threshold',
  },
];

const TABS = [
  { key: 'backtest', label: 'tactical.tabs.backtest' },
  { key: 'whatif', label: 'tactical.tabs.whatif' },
  { key: 'alerts', label: 'tactical.tabs.alerts' },
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
  ALERT_TRIGGER_OPTIONS,
  TABS,
  createDefaultCondition,
  useTacticalPageState,
};
export type { BacktestResponse };
