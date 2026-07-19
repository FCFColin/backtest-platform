/**
 * @file 战术网格搜索页面状态管理 hook
 * @description 承载 TacticalGridPage 的全部 state、参数校验与搜索执行逻辑
 */
import { useState } from 'react';
import type { TFunction } from 'i18next';
import type { RebalanceFrequency } from '@backtest/shared';
import { useComputeTool } from './useComputeTool.js';
import { apiPostJSON } from '@/utils/apiClient';
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

/**
 * 战术网格搜索页面状态 hook
 * @param t - i18n 翻译函数
 * @returns 全部状态 + 派生标签 + 搜索执行函数
 */
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
      return apiPostJSON<TacticalGridResponse>(
        '/api/v1/tactical-grid/search',
        {
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
        },
        t('tacticalGrid.searchFailed'),
      );
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
