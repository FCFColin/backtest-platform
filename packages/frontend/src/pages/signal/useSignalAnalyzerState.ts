import { useTranslation } from 'react-i18next';
import type { SignalAnalysisResult, SignalType } from '@backtest/shared/types/signal';
import { useAnalysisState } from '../../hooks/miscHooks.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { buildSignalRequest } from './signalTypes.js';
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
