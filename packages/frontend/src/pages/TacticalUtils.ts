import { useState } from 'react';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import type { RebalanceFrequency, PortfolioResult } from '@backtest/shared';
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

const INDICATOR_OPTIONS: Array<{
  value: TechnicalIndicator;
  label: string;
}> = [
  { value: 'sma', label: 'SMA 简单均线' },
  { value: 'ema', label: 'EMA 指数均线' },
  { value: 'rsi', label: 'RSI 相对强弱' },
  { value: 'macd', label: 'MACD' },
  { value: 'bollinger', label: 'Bollinger 布林带' },
  { value: 'momentum', label: 'Momentum 动量' },
];

const OPERATOR_OPTIONS: Array<{ value: SignalCondition['operator']; label: string }> = [
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'cross_above', label: '交叉上穿' },
  { value: 'cross_below', label: '交叉下穿' },
];

const REBALANCE_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季' },
  { value: 'annual', label: '每年' },
  { value: 'none', label: '不调仓' },
];

const AGGREGATION_OPTIONS: Array<{ value: TacticalStrategy['aggregationMethod']; label: string }> =
  [
    { value: 'voting', label: '投票' },
    { value: 'weighted_average', label: '加权平均' },
    { value: 'rank', label: '排名' },
  ];

const RANKING_METHOD_OPTIONS: Array<{ value: 'fixed_share' | 'risk_parity'; label: string }> = [
  { value: 'fixed_share', label: '固定份额' },
  { value: 'risk_parity', label: '风险平价' },
];

const ALERT_TRIGGER_OPTIONS: Array<{
  value: EmailAlertConfig['triggers'][number];
  label: string;
  desc: string;
}> = [
  { value: 'signal_change', label: '信号变化', desc: '当激活信号发生切换时触发' },
  { value: 'rebalance', label: '再平衡', desc: '每次再平衡调仓时触发' },
  { value: 'threshold', label: '阈值触发', desc: '指标突破设定阈值时触发' },
];

const TABS = [
  { key: 'backtest', label: '回测结果' },
  { key: 'whatif', label: 'What If' },
  { key: 'alerts', label: '邮件告警' },
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
    name: '信号 1',
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
    name: '战术策略',
    signals: [createDefaultSignal()],
    aggregationMethod: 'voting',
    rankingConfig: { method: 'fixed_share', topN: 3 },
  };
}

function validateStrategy(signals: TradingSignal[]): string | null {
  for (const sig of signals) {
    if (sig.conditions.length === 0) return `信号「${sig.name}」缺少触发条件`;
    const validWeights = sig.targetWeights.filter((w) => w.ticker && w.weight > 0);
    if (validWeights.length === 0) return `信号「${sig.name}」缺少有效目标权重`;
  }
  return null;
}

function useTacticalPageState() {
  const [strategy, setStrategy] = useState<TacticalStrategy>(createDefaultStrategy);
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
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
    newSignal.name = `信号 ${strategy.signals.length + 1}`;
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
      const res = await fetch('/api/tactical/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, startDate, endDate, startingValue, rebalanceFrequency }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '回测失败');
      setResults(json.data);
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
  genId,
  createDefaultCondition,
  createDefaultSignal,
  createDefaultStrategy,
  validateStrategy,
  useTacticalPageState,
};
export type { BacktestResponse };
