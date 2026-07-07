import { useState } from 'react';
import { useAsyncAction } from './useAsyncAction';
import type { SignalAnalysisRequest } from '@backtest/shared/types/signal';
import type { SignalItem, MultiSignalResponse } from '../components/multiSignal/types.js';

function useMultiSignalStateInner() {
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
  return {
    signals,
    setSignals,
    weights,
    setWeights,
    aggregationMethod,
    setAggregationMethod,
    ticker,
    setTicker,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isLoading,
    error,
    run,
    setError,
    results,
    setResults,
    nextId,
    setNextId,
  };
}

export function useMultiSignalState() {
  const s = useMultiSignalStateInner();

  const addSignal = () => {
    const newId = s.nextId;
    s.setSignals([...s.signals, { id: newId, indicator: 'EMA', period: 50, threshold: 30 }]);
    s.setWeights([...s.weights, 1 / (s.signals.length + 1)]);
    s.setNextId(newId + 1);
  };
  const removeSignal = (id: number) => {
    if (s.signals.length <= 1) return;
    const idx = s.signals.findIndex((sig) => sig.id === id);
    s.setSignals(s.signals.filter((sig) => sig.id !== id));
    if (idx >= 0) s.setWeights(s.weights.filter((_, i) => i !== idx));
  };
  const updateSignal = (id: number, patch: Partial<SignalItem>) => {
    s.setSignals(s.signals.map((sig) => (sig.id === id ? { ...sig, ...patch } : sig)));
  };
  const updateWeight = (idx: number, val: number) => {
    const next = [...s.weights];
    next[idx] = val;
    s.setWeights(next);
  };

  const runAnalysis = () => {
    if (!s.ticker.trim()) {
      s.setError('请输入标的代码');
      return;
    }
    if (s.signals.length === 0) {
      s.setError('请至少添加一个信号');
      return;
    }
    s.run(async () => {
      const reqSignals: SignalAnalysisRequest[] = s.signals.map((sig) => ({
        ticker: s.ticker.trim().toUpperCase(),
        indicator: sig.indicator,
        period: sig.period,
        threshold: sig.threshold,
        startDate: s.startDate,
        endDate: s.endDate,
        signalType: 'both',
      }));
      const res = await fetch('/api/signal/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signals: reqSignals,
          aggregationMethod: s.aggregationMethod,
          weights: s.aggregationMethod === 'weighted' ? s.weights : undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '分析失败');
      s.setResults(json.data as MultiSignalResponse);
    });
  };

  return { ...s, addSignal, removeSignal, updateSignal, updateWeight, runAnalysis };
}
