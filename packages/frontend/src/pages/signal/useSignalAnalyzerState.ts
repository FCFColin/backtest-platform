import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  SignalAnalysisRequest,
  SignalAnalysisResult,
  SignalType,
} from '@backtest/shared/types/signal';
import { useComputeTool } from '../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import i18n from '../../i18n/index.js';
export interface UseSignalAnalyzerStateResult {
  ticker: string;
  setTicker: (v: string) => void;
  indicator: string;
  setIndicator: (v: string) => void;
  period: number;
  setPeriod: (v: number) => void;
  threshold: number;
  setThreshold: (v: number) => void;
  signalType: SignalType;
  setSignalType: (v: SignalType) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  results: SignalAnalysisResult | null;
  runAnalysis: () => void;
}
export function useSignalAnalyzerState(): UseSignalAnalyzerStateResult {
  const { t } = useTranslation();
  const [ticker, setTicker] = useState('SPY');
  const [indicator, setIndicator] = useState<string>('SMA');
  const [period, setPeriod] = useState(20);
  const [threshold, setThreshold] = useState(30);
  const [signalType, setSignalType] = useState<SignalType>('both');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const {
    isLoading,
    error,
    results,
    runCompute: runAnalysis,
  } = useComputeTool<SignalAnalysisResult>(
    async () => {
      const reqBody: SignalAnalysisRequest = {
        ticker: ticker.trim().toUpperCase(),
        indicator,
        period,
        threshold,
        startDate,
        endDate,
        signalType,
      };
      return apiPostJSON<SignalAnalysisResult>(
        '/api/v1/signal/analyze',
        reqBody,
        i18n.t('signal.common.errAnalyze'),
      );
    },
    () => (ticker.trim() ? null : t('signal.common.errEmptyTicker')),
  );
  return {
    ticker,
    setTicker,
    indicator,
    setIndicator,
    period,
    setPeriod,
    threshold,
    setThreshold,
    signalType,
    setSignalType,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isLoading,
    error,
    results,
    runAnalysis,
  };
}
