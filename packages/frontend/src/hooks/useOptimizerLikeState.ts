/**
 * @file 优化器类页面共享 setter hook
 * @description 抽取各 optimizer 页面（efficient-frontier / optimizer / backtest-optimizer）
 *              通用的异步状态字段（startDate/endDate/isLoading/error/results），消除 ~30 行
 *              重复 useState 样板。各页面-specific 字段仍由调用方自行 useState 后 spread。
 */
import { useState } from 'react';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

/** 优化器类页面共享的异步状态字段 */
export interface OptimizerLikeState<TResults> {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
  results: TResults | null;
  setResults: (v: TResults | null) => void;
}

/**
 * 提供优化器类页面共享的异步状态字段
 *
 * 包含日期范围、加载态、错误信息、结果对象；不含页面特定字段（如 tickers、objective 等），
 * 调用方需自行 useState 后与返回值合并。
 *
 * @returns 共享状态及对应 setter
 */
export function useOptimizerLikeState<TResults>(): OptimizerLikeState<TResults> {
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TResults | null>(null);

  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isLoading,
    setIsLoading,
    error,
    setError,
    results,
    setResults,
  };
}
