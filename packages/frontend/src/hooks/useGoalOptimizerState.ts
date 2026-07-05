import { useState } from 'react';
import { useAsyncAction } from './useAsyncAction';
import type { GoalOptimizerResult } from '@backtest/shared/types/goal.js';
import type { GoalAsset } from '../components/goalOptimizer/types.js';
import { validateGoalInputs } from '../components/goalOptimizer/utils.js';

export function useGoalOptimizerState() {
  const [targetAmount, setTargetAmount] = useState(1000000);
  const [initialAmount, setInitialAmount] = useState(100000);
  const [years, setYears] = useState(20);
  const [assets, setAssets] = useState<GoalAsset[]>([
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ]);
  const [maxDrawdown, setMaxDrawdown] = useState<number | ''>('');
  const [minSuccessRate, setMinSuccessRate] = useState<number | ''>('');
  const [maxVolatility, setMaxVolatility] = useState<number | ''>('');
  const [numSimulations, setNumSimulations] = useState(1000);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<GoalOptimizerResult | null>(null);

  const addAsset = () => setAssets([...assets, { ticker: '', weight: 0 }]);
  const removeAsset = (idx: number) => {
    if (assets.length > 1) setAssets(assets.filter((_, i) => i !== idx));
  };
  const updateAsset = (idx: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...assets];
    next[idx] = { ...next[idx], [field]: val };
    setAssets(next);
  };
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);

  const runOptimize = () => {
    const validAssets = assets.filter((a) => a.ticker.trim());
    const err = validateGoalInputs(validAssets, totalWeight, targetAmount, initialAmount, years);
    if (err) {
      setError(err);
      return;
    }
    run(async () => {
      const constraints: { maxDrawdown?: number; minSuccessRate?: number; maxVolatility?: number } =
        {};
      if (maxDrawdown !== '') constraints.maxDrawdown = maxDrawdown / 100;
      if (minSuccessRate !== '') constraints.minSuccessRate = minSuccessRate / 100;
      if (maxVolatility !== '') constraints.maxVolatility = maxVolatility / 100;
      const res = await fetch('/api/goal-optimizer/optimize', {
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
      if (json.success === false) throw new Error(json.error || '目标优化失败');
      setResults(json.data);
    });
  };

  return {
    targetAmount,
    initialAmount,
    years,
    assets,
    maxDrawdown,
    minSuccessRate,
    maxVolatility,
    numSimulations,
    isLoading,
    error,
    results,
    totalWeight,
    addAsset,
    removeAsset,
    updateAsset,
    runOptimize,
    setTargetAmount,
    setInitialAmount,
    setYears,
    setMaxDrawdown,
    setMinSuccessRate,
    setMaxVolatility,
    setNumSimulations,
  };
}
