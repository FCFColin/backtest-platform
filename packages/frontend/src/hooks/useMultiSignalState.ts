import { useState } from 'react';
import { useAsyncAction } from './useAsyncAction';
import type { SignalAnalysisRequest, MultiSignalConfig } from '@backtest/shared/types/signal';
import type { SignalItem, MultiSignalResponse } from '../components/multiSignal/types.js';

export function useMultiSignalState() {
  const [signals, setSignals] = useState<SignalItem[]>([
    { id: 1, indicator: 'SMA', period: 20, threshold: 30 },
    { id: 2, indicator: 'RSI', period: 14, threshold: 30 },
  ]);
  const [weights, setWeights] = useState<number[]>([0.5, 0.5]);
  const [aggregationMethod, setAggregationMethod] = useState<'weighted' | 'voting' | 'rank'>(
    'weighted',
  );
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<MultiSignalResponse | null>(null);
  const [nextId, setNextId] = useState(3);

  const addSignal = () => {
    const newId = nextId;
    setSignals([...signals, { id: newId, indicator: 'EMA', period: 50, threshold: 30 }]);
    setWeights([...weights, 1 / (signals.length + 1)]);
    setNextId(newId + 1);
  };
  const removeSignal = (id: number) => {
    if (signals.length <= 1) return;
    const idx = signals.findIndex((s) => s.id === id);
    setSignals(signals.filter((s) => s.id !== id));
    if (idx >= 0) setWeights(weights.filter((_, i) => i !== idx));
  };
  const updateSignal = (id: number, patch: Partial<SignalItem>) => {
    setSignals(signals.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const updateWeight = (idx: number, val: number) => {
    const next = [...weights];
    next[idx] = val;
    setWeights(next);
  };

  const runAnalysis = () => {
    if (!ticker.trim()) {
      setError('请输入标的代码');
      return;
    }
    if (signals.length === 0) {
      setError('请至少添加一个信号');
      return;
    }
    run(async () => {
      const reqSignals: SignalAnalysisRequest[] = signals.map((s) => ({
        ticker: ticker.trim().toUpperCase(),
        indicator: s.indicator,
        period: s.period,
        threshold: s.threshold,
        startDate,
        endDate,
        signalType: 'both',
      }));
      const reqBody: MultiSignalConfig = {
        signals: reqSignals,
        aggregationMethod,
        weights: aggregationMethod === 'weighted' ? weights : undefined,
      };
      const res = await fetch('/api/signal/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '分析失败');
      setResults(json.data as MultiSignalResponse);
    });
  };

  return {
    signals,
    weights,
    aggregationMethod,
    ticker,
    startDate,
    endDate,
    isLoading,
    error,
    results,
    addSignal,
    removeSignal,
    updateSignal,
    updateWeight,
    setAggregationMethod,
    setTicker,
    setStartDate,
    setEndDate,
    runAnalysis,
  };
}
