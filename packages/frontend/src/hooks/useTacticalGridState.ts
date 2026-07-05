import { useState } from 'react';
import type { RebalanceFrequency } from '@backtest/shared/types';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import type {
  IndicatorType,
  ObjectiveType,
  ParamRange,
  TacticalGridResponse,
} from '../components/tacticalGrid/types.js';
import { getParamLabels, validateGridParams } from '../components/tacticalGrid/utils.js';

export function useTacticalGridState() {
  const [indicator, setIndicator] = useState<IndicatorType>('sma');
  const [param1, setParam1] = useState<ParamRange>({ min: 10, max: 50, step: 5 });
  const [param2, setParam2] = useState<ParamRange>({ min: 0, max: 5, step: 1 });
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [startingValue, setStartingValue] = useState(10000);
  const [rebalanceFrequency, setRebalanceFrequency] = useState<RebalanceFrequency>('daily');
  const [objective, setObjective] = useState<ObjectiveType>('maxSharpe');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<TacticalGridResponse | null>(null);
  const paramLabels = getParamLabels(indicator);

  const runSearch = () => {
    const trimmedTicker = ticker.trim().toUpperCase();
    const validationError = validateGridParams(ticker, param1, param2);
    if (validationError) {
      setError(validationError);
      return;
    }
    run(async () => {
      const res = await fetch('/api/tactical-grid/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indicator,
          param1,
          param2,
          tickers: [trimmedTicker],
          startDate,
          endDate,
          startingValue,
          rebalanceFrequency,
          objective,
          topN: 10,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '网格搜索失败');
      setResults(json.data as TacticalGridResponse);
    });
  };

  return {
    indicator,
    setIndicator,
    param1,
    setParam1,
    param2,
    setParam2,
    ticker,
    setTicker,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startingValue,
    setStartingValue,
    rebalanceFrequency,
    setRebalanceFrequency,
    objective,
    setObjective,
    isLoading,
    error,
    results,
    runSearch,
    paramLabels,
  };
}

export type TacticalGridState = ReturnType<typeof useTacticalGridState>;
