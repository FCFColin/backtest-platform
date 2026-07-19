/**
 * @file 目标优化器页面状态管理 hook
 * @description 承载 GoalOptimizerPage 的全部 state、资产 CRUD、约束装配与优化执行
 */
import { useState } from 'react';
import type { TFunction } from 'i18next';
import type { GoalOptimizerResult } from '@backtest/shared';
import { useComputeTool } from './useComputeTool.js';
import { useListState } from './useListState.js';
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

/** 资产列表的初始默认值 */
const DEFAULT_ASSETS: GoalAsset[] = [
  { ticker: 'VTI', weight: 60 },
  { ticker: 'BND', weight: 40 },
];

/** 资产 CRUD 子 hook：抽出以避免触发 max-lines-per-function 规则 */
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

/** 由 maxDrawdown/minSuccessRate/maxVolatility 装配约束对象（百分号 → 小数） */
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

/**
 * 目标优化器页面状态 hook
 * @param t - i18n 翻译函数
 * @returns 全部状态 + 资产 CRUD + 派生 totalWeight + 优化执行函数
 */
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
  const {
    isLoading,
    error,
    results,
    runCompute: runOptimize,
  } = useComputeTool<GoalOptimizerResult>(
    async () => {
      const validAssets = assets.filter((a) => a.ticker.trim());
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
      const validAssets = assets.filter((a) => a.ticker.trim());
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
