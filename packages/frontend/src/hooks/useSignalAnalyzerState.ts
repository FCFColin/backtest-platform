import { useState } from 'react';
import { useAsyncAction } from './useAsyncAction';
import type {
  SignalAnalysisRequest,
  SignalAnalysisResult,
  SignalType,
} from '@backtest/shared/types/signal';

export function useSignalAnalyzerState() {
  const [ticker, setTicker] = useState('SPY');
  const [indicator, setIndicator] = useState<string>('SMA');
  const [period, setPeriod] = useState(20);
  const [threshold, setThreshold] = useState(30);
  const [signalType, setSignalType] = useState<SignalType>('both');
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<SignalAnalysisResult | null>(null);

  const runAnalysis = () => {
    if (!ticker.trim()) {
      setError('请输入标的代码');
      return;
    }
    run(async () => {
      const reqBody: SignalAnalysisRequest = {
        ticker: ticker.trim().toUpperCase(),
        indicator,
        period,
        threshold,
        startDate,
        endDate,
        signalType,
      };
      const res = await fetch('/api/signal/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '分析失败');
      setResults(json.data as SignalAnalysisResult);
    });
  };

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
