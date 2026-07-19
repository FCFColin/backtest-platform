/**
 * @file 因子回归页面状态管理 hook
 * @description 承载 FactorRegressionPage 的全部 state、参数校验与回归执行逻辑
 */
import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useAsyncAction } from './useAsyncAction.js';
import { useListState } from './useListState.js';
import { useToastStore } from '@/store/toastStore';
import { fetchRegression } from '../pages/factor-regression/factorRegressionUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { validateAssetWeights } from '@/utils/validation';
import type {
  AssetItem,
  FactorRegressionResult,
  ReturnFrequency,
} from '../pages/factor-regression/factorRegressionUtils.js';

interface FactorRegressionState {
  startDate: string;
  endDate: string;
  returnFrequency: ReturnFrequency;
  rfSource: string;
  selectedFactors: string[];
  assets: AssetItem[];
  totalWeight: number;
  isLoading: boolean;
  error: string | null;
  result: FactorRegressionResult | null;
  runRegression: () => void;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  setReturnFrequency: (v: ReturnFrequency) => void;
  setRfSource: (v: string) => void;
  toggleFactor: (key: string) => void;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string | number) => void;
}

/**
 * 因子回归页面状态 hook
 * @param t - i18n 翻译函数
 * @returns 全部状态 + 派生字段 + 资产 CRUD + 回归执行函数
 */
export function useFactorRegressionState(t: TFunction): FactorRegressionState {
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [returnFrequency, setReturnFrequency] = useState<ReturnFrequency>('monthly');
  const [rfSource, setRfSource] = useState('us-3m');
  const [selectedFactors, setSelectedFactors] = useState<string[]>(['mktRF', 'smb', 'hml']);
  const {
    items: assets,
    addItem: addAsset,
    removeItem: removeAsset,
    updateItem,
  } = useListState<AssetItem>(
    [
      { ticker: 'VTI', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    () => ({ ticker: '', weight: 0 }),
    0,
  );
  const { isLoading, error, run, setError } = useAsyncAction();
  const [result, setResult] = useState<FactorRegressionResult | null>(null);

  const toggleFactor = (key: string) =>
    setSelectedFactors((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key],
    );
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string | number) =>
    updateItem(i, (prev) => ({ ...prev, [field]: val }));
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);
  const runRegression = () => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) {
      setError(t('factorRegression.errEmptyAssets'));
      return;
    }
    const weightErr = validateAssetWeights(assets);
    if (weightErr) {
      setError(weightErr);
      return;
    }
    if (selectedFactors.length === 0) {
      setError(t('factorRegression.errNoFactor'));
      return;
    }
    setResult(null);
    run(async () => {
      try {
        const r = await fetchRegression({
          validAssets,
          startDate,
          endDate,
          selectedFactors,
          returnFrequency,
          rfSource,
        });
        setResult(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('factorRegression.errRegFailed');
        setError(msg);
        useToastStore.getState().addToast('error', msg);
      }
    });
  };

  return {
    startDate,
    endDate,
    returnFrequency,
    rfSource,
    selectedFactors,
    assets,
    totalWeight,
    isLoading,
    error,
    result,
    runRegression,
    setStartDate,
    setEndDate,
    setReturnFrequency,
    setRfSource,
    toggleFactor,
    addAsset,
    removeAsset,
    updateAsset,
  };
}
