/**
 * @file LETF Slippage 页面状态管理 hook
 * @description 从 LETFSlippagePage.tsx 拆出的状态与处理函数，避免触发 max-lines-per-function 规则
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LETFResult } from '@backtest/shared';
import { useAsyncAction } from '../../../hooks/useAsyncAction.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../../i18n/index.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

/** LETF Slippage 页面的状态与处理函数集合 */
export function useLETFSlippageState() {
  const { t } = useTranslation();
  const [letfTicker, setLetfTicker] = useState('TQQQ');
  const [benchmarkTicker, setBenchmarkTicker] = useState('QQQ');
  const [leverage, setLeverage] = useState(3);
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<LETFResult | null>(null);

  const runAnalysis = () => {
    if (!letfTicker.trim() || !benchmarkTicker.trim()) {
      setError(t('letf.errEmptyTickers'));
      return;
    }
    run(async () => {
      const data = await apiPostJSON<LETFResult>(
        '/api/v1/letf/analyze',
        {
          letfTicker: letfTicker.trim(),
          benchmarkTicker: benchmarkTicker.trim(),
          leverage,
          startDate,
          endDate,
        },
        i18n.t('letf.errAnalyze'),
      );
      setResults(data);
    });
  };

  return {
    letfTicker,
    benchmarkTicker,
    leverage,
    startDate,
    endDate,
    isLoading,
    error,
    results,
    setLetfTicker,
    setBenchmarkTicker,
    setLeverage,
    setStartDate,
    setEndDate,
    runAnalysis,
  };
}
