import { useState } from 'react';
import type { TFunction } from 'i18next';
import type { GoalOptimizerResult } from '@backtest/shared';
import { useComputeTool, useListState } from './miscHooks.js';
import { apiFetch } from '@/utils/apiClient';
import i18n from '../i18n/index.js';
import { validateGoalInputs } from '../pages/goal-optimizer/goalOptimizerUtils.js';
import type { GoalAsset } from '../pages/goal-optimizer/goalOptimizerUtils.js';
interface GoalOptimizerState {
  targetAmount: number;
  setTargetAmount: (v: number) => void;
  initialAmount: number;
  setInitialAmount: (v: number) => void;
  years: number;
  setYears: (v: number) => void;
  assets: GoalAsset[];
  maxDrawdown: number | '';
  setMaxDrawdown: (v: number | '') => void;
  minSuccessRate: number | '';
  setMinSuccessRate: (v: number | '') => void;
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
const DEFAULT_ASSETS: GoalAsset[] = [
  { ticker: 'VTI', weight: 60 },
  { ticker: 'BND', weight: 40 },
];
function useGoalAssets() {
  const { items, addItem, removeItem, updateItem } = useListState<GoalAsset>(
    DEFAULT_ASSETS,
    () => ({ ticker: '', weight: 0 }),
    1,
  );
  const updateAsset = (idx: number, field: 'ticker' | 'weight', val: string | number) =>
    updateItem(idx, (prev) => ({ ...prev, [field]: val }));
  return { assets: items, addAsset: addItem, removeAsset: removeItem, updateAsset };
}
function buildOptimizeConstraints(
  maxDrawdown: number | '',
  minSuccessRate: number | '',
  maxVolatility: number | '',
): { maxDrawdown?: number; minSuccessRate?: number; maxVolatility?: number } {
  const constraints: { maxDrawdown?: number; minSuccessRate?: number; maxVolatility?: number } = {};
  if (maxDrawdown !== '') constraints.maxDrawdown = maxDrawdown / 100;
  if (minSuccessRate !== '') constraints.minSuccessRate = minSuccessRate / 100;
  if (maxVolatility !== '') constraints.maxVolatility = maxVolatility / 100;
  return constraints;
}
export function useGoalOptimizerState(t: TFunction): GoalOptimizerState {
  const [targetAmount, setTargetAmount] = useState(1000000);
  const [initialAmount, setInitialAmount] = useState(100000);
  const [years, setYears] = useState(20);
  const { assets, addAsset, removeAsset, updateAsset } = useGoalAssets();
  const [maxDrawdown, setMaxDrawdown] = useState<number | ''>('');
  const [minSuccessRate, setMinSuccessRate] = useState<number | ''>('');
  const [maxVolatility, setMaxVolatility] = useState<number | ''>('');
  const [numSimulations, setNumSimulations] = useState(1000);
  const totalWeight = assets.reduce((sum, a) => sum + (a.weight || 0), 0);
  const validAssets = assets.filter((a) => a.ticker.trim());
  const {
    isLoading,
    error,
    results,
    runCompute: runOptimize,
  } = useComputeTool<GoalOptimizerResult>(
    async () => {
      const constraints = buildOptimizeConstraints(maxDrawdown, minSuccessRate, maxVolatility);
      const res = await apiFetch('/api/v1/goal-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAmount,
          initialAmount,
          years,
          assets: validAssets,
          constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
          numSimulations,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false)
        throw new Error(json.error || i18n.t('goalOptimizer.errOptFailed'));
      return json.data as GoalOptimizerResult;
    },
    () => {
      return validateGoalInputs({
        validAssets,
        totalWeight,
        targetAmount,
        initialAmount,
        years,
        t,
      });
    },
  );
  return {
    targetAmount,
    setTargetAmount,
    initialAmount,
    setInitialAmount,
    years,
    setYears,
    assets,
    maxDrawdown,
    setMaxDrawdown,
    minSuccessRate,
    setMinSuccessRate,
    maxVolatility,
    setMaxVolatility,
    numSimulations,
    setNumSimulations,
    isLoading,
    error,
    results,
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    runOptimize,
  };
}
