/**
 * @file 资产分析页面状态管理 hook
 * @description 承载 AnalysisPage 的全部 state、ticker CRUD 与分析执行逻辑
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult } from '@backtest/shared';
import { useComputeTool } from './useComputeTool.js';
import { useListState } from './useListState.js';
import { fetchAnalysisResult } from '../pages/analysis/analysisUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

interface AnalysisPageState {
  tickers: string[];
  startDate: string;
  endDate: string;
  startingValue: number;
  rollingWindow: number;
  correlationWindow: number;
  adjustForInflation: boolean;
  activeTab: string;
  isLoading: boolean;
  error: string | null;
  results: AssetAnalysisResult | null;
  setTickers: (v: string[]) => void;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  setStartingValue: (v: number) => void;
  setRollingWindow: (v: number) => void;
  setCorrelationWindow: (v: number) => void;
  setAdjustForInflation: (v: boolean) => void;
  setActiveTab: (tab: string) => void;
  setResults: (v: AssetAnalysisResult | null) => void;
  addTicker: () => void;
  removeTicker: (idx: number) => void;
  updateTicker: (idx: number, val: string) => void;
  runAnalysis: () => void;
}

/** 资产分析页面状态 hook */
export function useAnalysisPageState(): AnalysisPageState {
  const { t } = useTranslation();
  const {
    items: tickers,
    setItems: setTickers,
    addItem: addTicker,
    removeItem: removeTicker,
    updateItem,
  } = useListState<string>(['SPY', 'TLT', 'GLD'], () => '', 1);
  const updateTicker = (idx: number, val: string) => updateItem(idx, () => val);
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [startingValue, setStartingValue] = useState(10000);
  const [rollingWindow, setRollingWindow] = useState(12);
  const [correlationWindow, setCorrelationWindow] = useState(12);
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const {
    isLoading,
    error,
    results,
    setResults,
    runCompute: runAnalysis,
  } = useComputeTool<AssetAnalysisResult>(
    async () => {
      const validTickers = tickers.filter(Boolean).map((tk) => tk.toUpperCase());
      return fetchAnalysisResult(
        validTickers,
        {
          startDate,
          endDate,
          startingValue,
          adjustForInflation,
          rollingWindow,
          correlationWindow,
        },
        t,
      );
    },
    () => (tickers.filter(Boolean).length > 0 ? null : t('analysis.errorMinOneTicker')),
  );

  return {
    tickers,
    startDate,
    endDate,
    startingValue,
    rollingWindow,
    correlationWindow,
    adjustForInflation,
    activeTab,
    isLoading,
    error,
    results,
    setTickers,
    setStartDate,
    setEndDate,
    setStartingValue,
    setRollingWindow,
    setCorrelationWindow,
    setAdjustForInflation,
    setActiveTab,
    setResults,
    addTicker,
    removeTicker,
    updateTicker,
    runAnalysis,
  };
}
