import { useState } from 'react';
import type { MultiSignalConfig } from '@backtest/shared/types/signal';
import { useComputeTool } from '../../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../../i18n/index.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import {
  buildSignalRequest,
  type AggregationMethod,
  type MultiSignalResponse,
  type SignalItem,
} from '../signalTypes.js';
function useSignalActions(
  signalsState: [SignalItem[], React.Dispatch<React.SetStateAction<SignalItem[]>>],
  weightsState: [number[], React.Dispatch<React.SetStateAction<number[]>>],
  nextIdState: [number, React.Dispatch<React.SetStateAction<number>>],
) {
  const [signals, setSignals] = signalsState;
  const [weights, setWeights] = weightsState;
  const [nextId, setNextId] = nextIdState;
  const addSignal = () => {
    setSignals((s) => [...s, { id: nextId, indicator: 'EMA', period: 50, threshold: 30 }]);
    setWeights((w) => {
      const n = w.length + 1;
      return [...w.map((x) => (x * (n - 1)) / n), 1 / n];
    });
    setNextId((id) => id + 1);
  };
  const removeSignal = (id: number) => {
    if (signals.length <= 1) return;
    const idx = signals.findIndex((s) => s.id === id);
    setSignals((s) => s.filter((x) => x.id !== id));
    if (idx >= 0)
      setWeights((w) => {
        const next = w.filter((_, i) => i !== idx);
        const total = next.reduce((a, b) => a + b, 0);
        return total > 0 ? next.map((x) => x / total) : next;
      });
  };
  const updateSignal = (id: number, patch: Partial<SignalItem>) =>
    setSignals(signals.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const updateWeight = (idx: number, val: number) => {
    const next = [...weights];
    next[idx] = val;
    setWeights(next);
  };
  return { addSignal, removeSignal, updateSignal, updateWeight };
}
export type UseMultiSignalStateResult = ReturnType<typeof useMultiSignalState>;
export function useMultiSignalState() {
  const [signals, setSignals] = useState<SignalItem[]>([
    { id: 1, indicator: 'SMA', period: 20, threshold: 30 },
    { id: 2, indicator: 'RSI', period: 14, threshold: 30 },
  ]);
  const [weights, setWeights] = useState<number[]>([0.5, 0.5]);
  const [aggregationMethod, setAggregationMethod] = useState<AggregationMethod>('weighted');
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const {
    isLoading,
    error,
    results,
    runCompute: runAnalysis,
  } = useComputeTool<MultiSignalResponse>(
    async () => {
      const reqSignals = signals.map((s) =>
        buildSignalRequest(ticker, s, 'both', startDate, endDate),
      );
      const reqBody: MultiSignalConfig = {
        signals: reqSignals,
        aggregationMethod,
        weights: aggregationMethod === 'weighted' ? weights : undefined,
      };
      return apiPostJSON<MultiSignalResponse>(
        '/api/v1/signal/multi',
        reqBody,
        i18n.t('Analysis failed'),
      );
    },
    () => {
      if (!ticker.trim()) return i18n.t('Please enter a ticker symbol');
      if (signals.length === 0) return i18n.t('Please add at least one signal');
      return null;
    },
  );
  const [nextId, setNextId] = useState(3);
  const { addSignal, removeSignal, updateSignal, updateWeight } = useSignalActions(
    [signals, setSignals],
    [weights, setWeights],
    [nextId, setNextId],
  );
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
