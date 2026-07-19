/**
 * @file PCA 页面状态管理 hook
 * @description 从 PCAPage.tsx 拆出的状态与处理函数，避免触发 max-lines-per-function 规则
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PCAResult } from '@backtest/shared';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { useListState } from '../../hooks/useListState.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../i18n/index.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

/** PCA 页面的状态与处理函数集合 */
export function usePcaPageState() {
  const { t } = useTranslation();
  const {
    items: tickers,
    addItem: addTicker,
    removeItem: removeTicker,
    updateItem,
  } = useListState<string>(['SPY', 'TLT', 'GLD', 'QQQ'], () => '', 1);
  const updateTicker = (idx: number, val: string) => updateItem(idx, () => val);
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [numComponents, setNumComponents] = useState<number | ''>('');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<PCAResult | null>(null);

  const runAnalysis = () => {
    const validTickers = tickers.map((tk) => tk.trim()).filter(Boolean);
    if (validTickers.length < 2) {
      setError(t('pca.errMinTwoTickers'));
      return;
    }
    run(async () => {
      const data = await apiPostJSON<PCAResult>(
        '/api/v1/pca/analyze',
        {
          tickers: validTickers,
          startDate,
          endDate,
          numComponents: numComponents === '' ? undefined : numComponents,
        },
        i18n.t('pca.errAnalyze'),
      );
      setResults(data);
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
