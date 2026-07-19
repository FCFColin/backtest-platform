/**
 * @file 单信号分析页面状态 Hook
 * @description 封装 SignalAnalyzerPage 的参数状态、异步执行与结果管理
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  SignalAnalysisRequest,
  SignalAnalysisResult,
  SignalType,
} from '@backtest/shared/types/signal';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { apiPostJSON } from '@/utils/apiClient';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import i18n from '../../i18n/index.js';

/** 单信号分析页面状态 Hook 返回值 */
export interface UseSignalAnalyzerStateResult {
  ticker: string;
  setTicker: (v: string) => void;
  indicator: string;
  setIndicator: (v: string) => void;
  period: number;
  setPeriod: (v: number) => void;
  threshold: number;
  setThreshold: (v: number) => void;
  signalType: SignalType;
  setSignalType: (v: SignalType) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  results: SignalAnalysisResult | null;
  runAnalysis: () => void;
}

/**
 * 单信号分析页面状态 Hook
 *
 * 管理 7 个参数字段（ticker/indicator/period/threshold/signalType/startDate/endDate）
 * 与异步请求结果，封装 runAnalysis 校验与 API 调用逻辑。
 */
export function useSignalAnalyzerState(): UseSignalAnalyzerStateResult {
  const { t } = useTranslation();
  const [ticker, setTicker] = useState('SPY');
  const [indicator, setIndicator] = useState<string>('SMA');
  const [period, setPeriod] = useState(20);
  const [threshold, setThreshold] = useState(30);
  const [signalType, setSignalType] = useState<SignalType>('both');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<SignalAnalysisResult | null>(null);

  const runAnalysis = () => {
    if (!ticker.trim()) {
      setError(t('signal.common.errEmptyTicker'));
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
      const data = await apiPostJSON<SignalAnalysisResult>(
        '/api/v1/signal/analyze',
        reqBody,
        i18n.t('signal.common.errAnalyze'),
      );
      setResults(data);
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
