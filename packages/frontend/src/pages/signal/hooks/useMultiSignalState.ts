/**
 * @file useMultiSignalState Hook
 * @description 多信号聚合页面状态管理：信号列表、权重、聚合方式、回测参数与异步分析
 */
import { useState } from 'react';
import type { SignalAnalysisRequest, MultiSignalConfig } from '@backtest/shared/types/signal';
import { useComputeTool } from '../../../hooks/useComputeTool.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../../i18n/index.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import type { AggregationMethod, MultiSignalResponse, SignalItem } from '../multiSignalTypes.js';

/** 信号列表与权重的增删改操作；通过 state 元组传入以保持与父 hook 同一引用 */
function useSignalActions(
  signalsState: [SignalItem[], React.Dispatch<React.SetStateAction<SignalItem[]>>],
  weightsState: [number[], React.Dispatch<React.SetStateAction<number[]>>],
  nextIdState: [number, React.Dispatch<React.SetStateAction<number>>],
) {
  const [signals, setSignals] = signalsState;
  const [weights, setWeights] = weightsState;
  const [nextId, setNextId] = nextIdState;
  const addSignal = () => {
    setSignals([...signals, { id: nextId, indicator: 'EMA', period: 50, threshold: 30 }]);
    setWeights([...weights, 1 / (signals.length + 1)]);
    setNextId(nextId + 1);
  };
  const removeSignal = (id: number) => {
    if (signals.length <= 1) return;
    const idx = signals.findIndex((s) => s.id === id);
    setSignals(signals.filter((s) => s.id !== id));
    if (idx >= 0) setWeights(weights.filter((_, i) => i !== idx));
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

/** 多信号聚合页面状态：聚合信号列表、权重、聚合方式、回测参数与分析结果 */
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
      return apiPostJSON<MultiSignalResponse>(
        '/api/v1/signal/multi',
        reqBody,
        i18n.t('signal.common.errAnalyze'),
      );
    },
    () => {
      if (!ticker.trim()) return i18n.t('signal.common.errEmptyTicker');
      if (signals.length === 0) return i18n.t('signal.multi.errMinOneSignal');
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
