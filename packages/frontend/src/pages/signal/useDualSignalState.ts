/**
 * @file DualSignal 页面状态 hook
 * @description 抽离自 DualSignalPage 的状态管理与请求逻辑，便于独立测试与复用。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignalAnalysisRequest, DualSignalConfig } from '@backtest/shared/types/signal';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { apiPostJSON } from '@/utils/apiClient';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import i18n from '../../i18n/index.js';
import type { DualSignalResponse } from './dualSignalTypes.js';

/** 单信号配置（页面内简化结构） */
export interface SignalCfg {
  indicator: string;
  period: number;
  threshold: number;
}

/** DualSignal 页面状态 hook 返回值 */
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

/** DualSignal 页面状态 hook */
export function useDualSignalState(): UseDualSignalStateResult {
  const { t } = useTranslation();
  const [cfg1, setCfg1] = useState<SignalCfg>({ indicator: 'SMA', period: 20, threshold: 30 });
  const [cfg2, setCfg2] = useState<SignalCfg>({ indicator: 'EMA', period: 50, threshold: 30 });
  const [combinationMethod, setCombinationMethod] = useState<'and' | 'or' | 'xor'>('and');
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<DualSignalResponse | null>(null);

  const runAnalysis = () => {
    if (!ticker.trim()) {
      setError(t('signal.common.errEmptyTicker'));
      return;
    }
    run(async () => {
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
      const data = await apiPostJSON<DualSignalResponse>(
        '/api/v1/signal/dual',
        reqBody,
        i18n.t('signal.common.errAnalyze'),
      );
      setResults(data);
    });
  };

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
