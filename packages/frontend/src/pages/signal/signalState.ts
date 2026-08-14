import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  MultiSignalConfig,
  SignalAnalysisRequest,
  SignalAnalysisResult,
  SignalType,
} from '@backtest/shared/types/signal';
import { useAnalysisState, useComputeTool } from '../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../i18n/index.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { normalizeTicker } from '@/utils/ticker';

export type SignalDir = 'buy' | 'sell' | null;
function buildSignalRequest(
  ticker: string,
  cfg: Pick<SignalAnalysisRequest, 'indicator' | 'period' | 'threshold'>,
  signalType: SignalType,
  startDate: string,
  endDate: string,
): SignalAnalysisRequest {
  return { ticker: normalizeTicker(ticker), ...cfg, startDate, endDate, signalType };
}
export interface DualSignalResponse {
  signal1: SignalAnalysisResult;
  signal2: SignalAnalysisResult;
  combined: SignalAnalysisResult;
  comparison: Array<{ date: string; signal1: SignalDir; signal2: SignalDir; combined: SignalDir }>;
}
export type AggregationMethod = 'weighted' | 'voting' | 'rank';
export interface MultiSignalResponse {
  aggregated: SignalAnalysisResult;
  contributions: Array<{
    index: number;
    indicator: string;
    contribution: number;
    statistics: SignalAnalysisResult['statistics'];
  }>;
}
export interface ResultsPanelProps<T> {
  results: T | null;
  error: string | null;
  isLoading: boolean;
}
export interface SignalItem {
  id: number;
  indicator: string;
  period: number;
  threshold: number;
}

type AnalyzerState = {
  ticker: string;
  indicator: string;
  period: number;
  threshold: number;
  signalType: SignalType;
  startDate: string;
  endDate: string;
};
export type UseSignalAnalyzerStateResult = ReturnType<typeof useSignalAnalyzerState>;
export function useSignalAnalyzerState() {
  const { t } = useTranslation();
  return useAnalysisState<AnalyzerState, SignalAnalysisResult>(
    '/api/v1/signal/analyze',
    {
      ticker: 'SPY',
      indicator: 'SMA',
      period: 20,
      threshold: 30,
      signalType: 'both' as SignalType,
      startDate: DEFAULT_START_DATE,
      endDate: DEFAULT_END_DATE,
    },
    (s) => buildSignalRequest(s.ticker, s, s.signalType, s.startDate, s.endDate),
    (s) => (s.ticker.trim() ? null : t('Please enter a ticker symbol')),
  );
}

export interface SignalCfg {
  indicator: string;
  period: number;
  threshold: number;
}
type DualState = {
  cfg1: SignalCfg;
  cfg2: SignalCfg;
  combinationMethod: 'and' | 'or' | 'xor';
  ticker: string;
  startDate: string;
  endDate: string;
};
export type UseDualSignalStateResult = ReturnType<typeof useDualSignalState>;
export function useDualSignalState() {
  const { t } = useTranslation();
  return useAnalysisState<DualState, DualSignalResponse>(
    '/api/v1/signal/dual',
    {
      cfg1: { indicator: 'SMA', period: 20, threshold: 30 },
      cfg2: { indicator: 'EMA', period: 50, threshold: 30 },
      combinationMethod: 'and' as 'and' | 'or' | 'xor',
      ticker: 'SPY',
      startDate: DEFAULT_START_DATE,
      endDate: DEFAULT_END_DATE,
    },
    (s) => ({
      signal1: buildSignalRequest(s.ticker, s.cfg1, 'both', s.startDate, s.endDate),
      signal2: buildSignalRequest(s.ticker, s.cfg2, 'both', s.startDate, s.endDate),
      combinationMethod: s.combinationMethod,
    }),
    (s) => (s.ticker.trim() ? null : t('Please enter a ticker symbol')),
  );
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
  const [nextId, setNextId] = useState(3);
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
