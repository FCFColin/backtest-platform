import { useState } from 'react';
import type { TFunction } from 'i18next';
import type { RebalanceFrequency } from '@backtest/shared';
import { useComputeTool } from './miscHooks.js';
import { apiFetch } from '@/utils/apiClient';
import { extractApiErrorDetail } from '@/store/backtestHelpers.js';
import { pollJobStatus } from '@/store/backtestStore.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import {
  countCombinations,
  getParamLabelKeys,
  validateGridParams,
} from '../pages/tactical/tacticalGridUtils.js';
import type {
  IndicatorType,
  ObjectiveType,
  GridParamRange,
  TacticalGridResponse,
} from '../pages/tactical/tacticalGridUtils.js';
export interface TacticalGridState {
  indicator: IndicatorType;
  setIndicator: (v: IndicatorType) => void;
  param1: GridParamRange;
  setParam1: (v: GridParamRange) => void;
  param2: GridParamRange;
  setParam2: (v: GridParamRange) => void;
  ticker: string;
  setTicker: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  rebalanceFrequency: RebalanceFrequency;
  setRebalanceFrequency: (v: RebalanceFrequency) => void;
  objective: ObjectiveType;
  setObjective: (v: ObjectiveType) => void;
  isLoading: boolean;
  error: string | null;
  results: TacticalGridResponse | null;
  runSearch: () => void;
  paramLabels: { p1: string; p2: string };
}
// eslint-disable-next-line max-lines-per-function
export function useTacticalGridState(t: TFunction): TacticalGridState {
  const [indicator, setIndicator] = useState<IndicatorType>('sma');
  const [param1, setParam1] = useState<GridParamRange>({ min: 10, max: 50, step: 5 });
  const [param2, setParam2] = useState<GridParamRange>({ min: 0, max: 5, step: 1 });
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [startingValue, setStartingValue] = useState(10000);
  const [rebalanceFrequency, setRebalanceFrequency] = useState<RebalanceFrequency>('daily');
  const [objective, setObjective] = useState<ObjectiveType>('maxSharpe');
  const {
    isLoading,
    error,
    results,
    runCompute: runSearch,
  } = useComputeTool<TacticalGridResponse>(
    async () => {
      const trimmedTicker = ticker.trim().toUpperCase();
      const res = await apiFetch('/api/v1/tactical-grid/search', {
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
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(extractApiErrorDetail(json));
      if (res.status === 202 && json.statusUrl) {
        const polled = await pollJobStatus(json.statusUrl, new AbortController().signal, null);
        return polled.data as TacticalGridResponse;
      }
      return json.data as TacticalGridResponse;
    },
    () => {
      const errorKey = validateGridParams(ticker, param1, param2);
      if (!errorKey) return null;
      return errorKey === 'tacticalGrid.validateErrors.tooManyCombinations'
        ? t(errorKey, { total: countCombinations(param1, param2) })
        : t(errorKey);
    },
  );
  const paramLabelKeys = getParamLabelKeys(indicator);
  const paramLabels = {
    p1: t(paramLabelKeys.p1, { indicator: indicator.toUpperCase() }),
    p2: t(paramLabelKeys.p2),
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
