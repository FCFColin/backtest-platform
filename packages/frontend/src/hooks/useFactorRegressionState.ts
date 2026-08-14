import type { TFunction } from 'i18next';
import { useAsyncAction, useAssetList, useSetterState } from './miscHooks.js';
import { useToastStore } from '@/store/toastStore';
import { fetchRegression } from '../pages/factor-regression/factorRegressionUtils.js';
import {
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  DEFAULT_60_40_ASSETS,
} from '@/utils/constants';
import { validateAssetWeights } from '@/utils/validation';
import type {
  AssetItem,
  FactorRegressionResult,
} from '../pages/factor-regression/factorRegressionUtils.js';
export interface FactorRegressionState {
  startDate: string;
  endDate: string;
  selectedFactors: string[];
  assets: AssetItem[];
  totalWeight: number;
  isLoading: boolean;
  error: string | null;
  result: FactorRegressionResult | null;
  runRegression: () => void;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
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
  const s = useSetterState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    selectedFactors: ['mktRF', 'smb', 'hml'] as string[],
    result: null as FactorRegressionResult | null,
  });
  const { assets, addAsset, removeAsset, updateAsset, totalWeight } = useAssetList<AssetItem>(
    [...DEFAULT_60_40_ASSETS],
    () => ({ ticker: '', weight: 0 }),
    0,
  );
  const { isLoading, error, run, setError } = useAsyncAction();
  const toggleFactor = (key: string) =>
    s.setSelectedFactors(
      s.selectedFactors.includes(key)
        ? s.selectedFactors.filter((f) => f !== key)
        : [...s.selectedFactors, key],
    );
  const runRegression = () => {
    const validation = validateRegressionParams(assets, s.selectedFactors, t);
    if ('error' in validation) {
      setError(validation.error);
      return;
    }
    s.setResult(null);
    run(async () => {
      try {
        const r = await fetchRegression({
          validAssets: validation.validAssets,
          startDate: s.startDate,
          endDate: s.endDate,
          selectedFactors: s.selectedFactors,
        });
        s.setResult(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('Regression computation failed');
        setError(msg);
        useToastStore.getState().addToast('error', msg);
      }
    });
  };
  return {
    ...s,
    assets,
    totalWeight,
    isLoading,
    error,
    runRegression,
    toggleFactor,
    addAsset,
    removeAsset,
    updateAsset,
  };
}
