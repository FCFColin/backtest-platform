import type { TFunction } from 'i18next';
import type { RebalanceFrequency } from '@backtest/shared';
import { useComputeTool, useSetterState } from './miscHooks.js';
import { apiFetch } from '@/utils/apiClient';
import { extractApiErrorDetail } from '@/store/backtestHelpers.js';
import { pollJobStatus } from '@/store/backtestStore.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { normalizeTicker } from '@/utils/ticker';
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

export function useTacticalGridState(t: TFunction): TacticalGridState {
  const s = useSetterState({
    indicator: 'sma' as IndicatorType,
    param1: { min: 10, max: 50, step: 5 } as GridParamRange,
    param2: { min: 0, max: 5, step: 1 } as GridParamRange,
    ticker: 'SPY',
    startDate: DEFAULT_START_DATE,
    endDate: DEFAULT_END_DATE,
    startingValue: 10000,
    rebalanceFrequency: 'daily' as RebalanceFrequency,
    objective: 'maxSharpe' as ObjectiveType,
  });
  const {
    isLoading,
    error,
    results,
    runCompute: runSearch,
  } = useComputeTool<TacticalGridResponse>(
    async () => {
      const trimmedTicker = normalizeTicker(s.ticker);
      const res = await apiFetch('/api/v1/tactical-grid/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indicator: s.indicator,
          param1: s.param1,
          param2: s.param2,
          tickers: [trimmedTicker],
          startDate: s.startDate,
          endDate: s.endDate,
          startingValue: s.startingValue,
          rebalanceFrequency: s.rebalanceFrequency,
          objective: s.objective,
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
      const errorKey = validateGridParams(s.ticker, s.param1, s.param2);
      if (!errorKey) return null;
      return errorKey === 'tacticalGrid.validateErrors.tooManyCombinations'
        ? t(errorKey, { total: countCombinations(s.param1, s.param2) })
        : t(errorKey);
    },
  );
  const paramLabelKeys = getParamLabelKeys(s.indicator);
  const paramLabels = {
    p1: t(paramLabelKeys.p1, { indicator: s.indicator.toUpperCase() }),
    p2: t(paramLabelKeys.p2),
  };
  return {
    ...s,
    isLoading,
    error,
    results,
    runSearch,
    paramLabels,
  };
}
