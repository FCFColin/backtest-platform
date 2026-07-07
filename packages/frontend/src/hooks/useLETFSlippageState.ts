import { useState } from 'react';
import { useAsyncAction } from './useAsyncAction';
import i18n from '../i18n/index.js';
import type { LETFResult } from '@backtest/shared';

export function useLETFSlippageState() {
  const [letfTicker, setLetfTicker] = useState('TQQQ');
  const [benchmarkTicker, setBenchmarkTicker] = useState('QQQ');
  const [leverage, setLeverage] = useState(3);
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<LETFResult | null>(null);

  const runAnalysis = () => {
    if (!letfTicker.trim() || !benchmarkTicker.trim()) {
      setError(i18n.t('errors.letfTickerRequired'));
      return;
    }
    run(async () => {
      const res = await fetch('/api/letf/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letfTicker: letfTicker.trim(),
          benchmarkTicker: benchmarkTicker.trim(),
          leverage,
          startDate,
          endDate,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false)
        throw new Error(json.error || i18n.t('errors.letfAnalysisFailed'));
      setResults(json.data);
    });
  };

  return {
    letfTicker,
    setLetfTicker,
    benchmarkTicker,
    setBenchmarkTicker,
    leverage,
    setLeverage,
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
