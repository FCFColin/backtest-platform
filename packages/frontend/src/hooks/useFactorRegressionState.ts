import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useAsyncAction, useAssetList } from './miscHooks.js';
import { useToastStore } from '@/store/toastStore';
import { fetchRegression } from '../pages/factor-regression/factorRegressionUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { validateAssetWeights } from '@/utils/validation';
import type {
  AssetItem,
  FactorRegressionResult,
  ReturnFrequency,
} from '../pages/factor-regression/factorRegressionUtils.js';
export interface FactorRegressionState {
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
interface RegressionValidationSuccess {
  validAssets: AssetItem[];
}
interface RegressionValidationError {
  error: string;
}
type RegressionValidation = RegressionValidationSuccess | RegressionValidationError;
function validateRegressionParams(
  assets: AssetItem[],
  selectedFactors: string[],
  t: TFunction,
): RegressionValidation {
  const validAssets = assets.filter((a) => a.ticker.trim() !== '');
  if (validAssets.length === 0) return { error: t('Please add at least one ticker') };
  const weightErr = validateAssetWeights(assets);
  if (weightErr) return { error: weightErr };
  if (selectedFactors.length === 0) return { error: t('Please select at least one factor') };
  return { validAssets };
}
export function useFactorRegressionState(t: TFunction): FactorRegressionState {
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [returnFrequency, setReturnFrequency] = useState<ReturnFrequency>('monthly');
  const [rfSource, setRfSource] = useState('us-3m');
  const [selectedFactors, setSelectedFactors] = useState<string[]>(['mktRF', 'smb', 'hml']);
  const { assets, addAsset, removeAsset, updateAsset, totalWeight } = useAssetList<AssetItem>(
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
  const runRegression = () => {
    const validation = validateRegressionParams(assets, selectedFactors, t);
    if ('error' in validation) {
      setError(validation.error);
      return;
    }
    setResult(null);
    run(async () => {
      try {
        const r = await fetchRegression({
          validAssets: validation.validAssets,
          startDate,
          endDate,
          selectedFactors,
          returnFrequency,
          rfSource,
        });
        setResult(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('Regression computation failed');
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
