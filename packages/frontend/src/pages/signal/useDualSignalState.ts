import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignalAnalysisRequest, DualSignalConfig } from '@backtest/shared/types/signal';
import { useComputeTool } from '../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import i18n from '../../i18n/index.js';
import type { DualSignalResponse } from './signalTypes.js';
export interface SignalCfg {
  indicator: string;
  period: number;
  threshold: number;
}
export interface UseDualSignalStateResult {
  cfg1: SignalCfg;
  cfg2: SignalCfg;
  combinationMethod: 'and' | 'or' | 'xor';
  ticker: string;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  error: string | null;
  results: DualSignalResponse | null;
  setCfg1: (cfg: SignalCfg) => void;
  setCfg2: (cfg: SignalCfg) => void;
  setCombinationMethod: (m: 'and' | 'or' | 'xor') => void;
  setTicker: (v: string) => void;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  runAnalysis: () => void;
}
export function useDualSignalState(): UseDualSignalStateResult {
  const { t } = useTranslation();
  const [cfg1, setCfg1] = useState<SignalCfg>({ indicator: 'SMA', period: 20, threshold: 30 });
  const [cfg2, setCfg2] = useState<SignalCfg>({ indicator: 'EMA', period: 50, threshold: 30 });
  const [combinationMethod, setCombinationMethod] = useState<'and' | 'or' | 'xor'>('and');
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const {
    isLoading,
    error,
    results,
    runCompute: runAnalysis,
  } = useComputeTool<DualSignalResponse>(
    async () => {
      const buildReq = (c: SignalCfg): SignalAnalysisRequest => ({
        ticker: ticker.trim().toUpperCase(),
        indicator: c.indicator,
        period: c.period,
        threshold: c.threshold,
        startDate,
        endDate,
        signalType: 'both',
      });
      const reqBody: DualSignalConfig = {
        signal1: buildReq(cfg1),
        signal2: buildReq(cfg2),
        combinationMethod,
      };
      return apiPostJSON<DualSignalResponse>(
        '/api/v1/signal/dual',
        reqBody,
        i18n.t('Analysis failed'),
      );
    },
    () => (ticker.trim() ? null : t('Please enter a ticker symbol')),
  );
  return {
    cfg1,
    cfg2,
    combinationMethod,
    ticker,
    startDate,
    endDate,
    isLoading,
    error,
    results,
    setCfg1,
    setCfg2,
    setCombinationMethod,
    setTicker,
    setStartDate,
    setEndDate,
    runAnalysis,
  };
}
