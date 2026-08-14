import type { TFunction } from 'i18next';
import type { GoalOptimizerResult } from '@backtest/shared';
import { useComputeTool, useAssetList, useSetterState } from './miscHooks.js';
import { apiFetch } from '@/utils/apiClient';
import i18n from '../i18n/index.js';
import { validateGoalInputs } from '../pages/goal-optimizer/goalOptimizerUtils.js';
import type { GoalAsset } from '../pages/goal-optimizer/goalOptimizerUtils.js';
import { DEFAULT_60_40_ASSETS } from '@/utils/constants';
export interface GoalOptimizerState {
  targetAmount: number;
  setTargetAmount: (v: number) => void;
  initialAmount: number;
  setInitialAmount: (v: number) => void;
  years: number;
  setYears: (v: number) => void;
  assets: GoalAsset[];
  maxDrawdown: number | '';
  setMaxDrawdown: (v: number | '') => void;
  maxVolatility: number | '';
  setMaxVolatility: (v: number | '') => void;
  numSimulations: number;
  setNumSimulations: (v: number) => void;
  isLoading: boolean;
  error: string | null;
  results: GoalOptimizerResult | null;
  addAsset: () => void;
  removeAsset: (idx: number) => void;
  updateAsset: (idx: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number;
  runOptimize: () => void;
}
function buildOptimizeConstraints(
  maxDrawdown: number | '',
  maxVolatility: number | '',
): { maxDrawdown?: number; maxVolatility?: number } {
  const constraints: { maxDrawdown?: number; maxVolatility?: number } = {};
  if (maxDrawdown !== '') constraints.maxDrawdown = maxDrawdown / 100;
  if (maxVolatility !== '') constraints.maxVolatility = maxVolatility / 100;
  return constraints;
}
export function useGoalOptimizerState(t: TFunction): GoalOptimizerState {
  const s = useSetterState({
    targetAmount: 1000000,
    initialAmount: 100000,
    years: 20,
    maxDrawdown: '' as number | '',
    maxVolatility: '' as number | '',
    numSimulations: 1000,
  });
  const { assets, addAsset, removeAsset, updateAsset, totalWeight } = useAssetList<GoalAsset>(
    [...DEFAULT_60_40_ASSETS],
    () => ({ ticker: '', weight: 0 }),
    1,
  );
  const validAssets = assets.filter((a) => a.ticker.trim());
  const {
    isLoading,
    error,
    results,
    runCompute: runOptimize,
  } = useComputeTool<GoalOptimizerResult>(
    async () => {
      const constraints = buildOptimizeConstraints(s.maxDrawdown, s.maxVolatility);
      const res = await apiFetch('/api/v1/goal-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAmount: s.targetAmount,
          initialAmount: s.initialAmount,
          years: s.years,
          assets: validAssets,
          constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
          numSimulations: s.numSimulations,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || i18n.t('Goal optimization failed'));
      return json.data as GoalOptimizerResult;
    },
    () => {
      return validateGoalInputs({
        validAssets,
        totalWeight,
        targetAmount: s.targetAmount,
        initialAmount: s.initialAmount,
        years: s.years,
        t,
      });
    },
  );
  return {
    ...s,
    assets,
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    isLoading,
    error,
    results,
    runOptimize,
  };
}
