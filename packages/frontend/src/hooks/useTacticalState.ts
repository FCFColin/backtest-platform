/**
 * @file Tactical page state management hook
 */
import { useState } from 'react';
import type { RebalanceFrequency } from '@backtest/shared/types';
import type { TacticalStrategy, TradingSignal } from '@backtest/shared/types/tactical';
import { useAsyncAction } from './useAsyncAction.js';
import { createDefaultStrategy, createDefaultSignal } from '../components/tactical/types.js';
import type { BacktestResponse } from '../components/tactical/types.js';
import { validateStrategy } from '../components/tactical/utils.js';

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
        body: JSON.stringify({
          strategy,
          startDate,
          endDate,
          startingValue,
          rebalanceFrequency,
        }),
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

export type TacticalPageState = ReturnType<typeof useTacticalPageState>;

export { useTacticalPageState };
