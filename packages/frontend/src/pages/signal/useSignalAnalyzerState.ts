import { useTranslation } from 'react-i18next';
import type {
  SignalAnalysisRequest,
  SignalAnalysisResult,
  SignalType,
} from '@backtest/shared/types/signal';
import { useComputeTool, useSetterState } from '../../hooks/miscHooks.js';
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
  const s = useSetterState({
    ticker: 'SPY',
    indicator: 'SMA',
    period: 20,
    threshold: 30,
    signalType: 'both' as SignalType,
    startDate: DEFAULT_START_DATE,
    endDate: DEFAULT_END_DATE,
  });
  const {
    isLoading,
    error,
    results,
    runCompute: runAnalysis,
  } = useComputeTool<SignalAnalysisResult>(
    async () => {
      const reqBody: SignalAnalysisRequest = {
        ticker: s.ticker.trim().toUpperCase(),
        indicator: s.indicator,
        period: s.period,
        threshold: s.threshold,
        startDate: s.startDate,
        endDate: s.endDate,
        signalType: s.signalType,
      };
      return apiPostJSON<SignalAnalysisResult>(
        '/api/v1/signal/analyze',
        reqBody,
        i18n.t('Analysis failed'),
      );
    },
    () => (s.ticker.trim() ? null : t('Please enter a ticker symbol')),
  );
  return { ...s, isLoading, error, results, runAnalysis };
}
