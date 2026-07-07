import { useState } from 'react';
import type { PCAResult } from '@backtest/shared';
import { useAsyncAction } from './useAsyncAction.js';

export function usePCAState() {
  const [tickers, setTickers] = useState<string[]>(['SPY', 'TLT', 'GLD', 'QQQ']);
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [numComponents, setNumComponents] = useState<number | ''>('');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<PCAResult | null>(null);

  const addTicker = () => setTickers([...tickers, '']);
  const removeTicker = (idx: number) => {
    if (tickers.length > 1) setTickers(tickers.filter((_, i) => i !== idx));
  };
  const updateTicker = (idx: number, val: string) => {
    const next = [...tickers];
    next[idx] = val;
    setTickers(next);
  };

  const runAnalysis = () => {
    const validTickers = tickers.map((t) => t.trim()).filter(Boolean);
    if (validTickers.length < 2) {
      setError('PCA 分析至少需要 2 个标的代码');
      return;
    }
    run(async () => {
      const res = await fetch('/api/pca/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: validTickers,
          startDate,
          endDate,
          numComponents: numComponents === '' ? undefined : numComponents,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || 'PCA 分析失败');
      setResults(json.data);
    });
  };

  return {
    tickers,
    startDate,
    endDate,
    numComponents,
    isLoading,
    error,
    results,
    addTicker,
    removeTicker,
    updateTicker,
    setStartDate,
    setEndDate,
    setNumComponents,
    runAnalysis,
  };
}
