import { useState } from 'react';
import { useAsyncAction } from './useAsyncAction';
import i18n from '../i18n/index.js';
import type { SignalAnalysisRequest, DualSignalConfig } from '@backtest/shared/types/signal';
import type { SignalCfg, DualSignalResponse } from '../components/dualSignal/types.js';

export function useDualSignalState() {
  const [cfg1, setCfg1] = useState<SignalCfg>({ indicator: 'SMA', period: 20, threshold: 30 });
  const [cfg2, setCfg2] = useState<SignalCfg>({ indicator: 'EMA', period: 50, threshold: 30 });
  const [combinationMethod, setCombinationMethod] = useState<'and' | 'or' | 'xor'>('and');
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<DualSignalResponse | null>(null);

  const runAnalysis = () => {
    if (!ticker.trim()) {
      setError(i18n.t('errors.dualSignalTickerRequired'));
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
      const res = await fetch('/api/signal/dual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false)
        throw new Error(json.error || i18n.t('errors.dualSignalAnalysisFailed'));
      setResults(json.data as DualSignalResponse);
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
