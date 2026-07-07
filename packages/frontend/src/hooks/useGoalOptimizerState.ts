import { useState } from 'react';
import { useAsyncAction } from './useAsyncAction';
import type { GoalOptimizerResult } from '@backtest/shared/types/goal.js';
import type { GoalAsset } from '../components/goalOptimizer/types.js';
import { validateGoalInputs } from '../components/goalOptimizer/utils.js';

function useGoalOptimizerStateInner() {
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
  return {
    targetAmount,
    setTargetAmount,
    initialAmount,
    setInitialAmount,
    years,
    setYears,
    assets,
    setAssets,
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
    run,
    setError,
    results,
    setResults,
  };
}

export function useGoalOptimizerState() {
  const s = useGoalOptimizerStateInner();

  const addAsset = () => s.setAssets([...s.assets, { ticker: '', weight: 0 }]);
  const removeAsset = (idx: number) => {
    if (s.assets.length > 1) s.setAssets(s.assets.filter((_, i) => i !== idx));
  };
  const updateAsset = (idx: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...s.assets];
    next[idx] = { ...next[idx], [field]: val };
    s.setAssets(next);
  };
  const totalWeight = s.assets.reduce((sum, a) => sum + (a.weight || 0), 0);

  const runOptimize = () => {
    const validAssets = s.assets.filter((a) => a.ticker.trim());
    const err = validateGoalInputs(
      validAssets,
      totalWeight,
      s.targetAmount,
      s.initialAmount,
      s.years,
    );
    if (err) {
      s.setError(err);
      return;
    }
    s.run(async () => {
      const constraints: { maxDrawdown?: number; minSuccessRate?: number; maxVolatility?: number } =
        {};
      if (s.maxDrawdown !== '') constraints.maxDrawdown = s.maxDrawdown / 100;
      if (s.minSuccessRate !== '') constraints.minSuccessRate = s.minSuccessRate / 100;
      if (s.maxVolatility !== '') constraints.maxVolatility = s.maxVolatility / 100;
      const res = await fetch('/api/goal-optimizer/optimize', {
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
      if (json.success === false) throw new Error(json.error || '目标优化失败');
      s.setResults(json.data);
    });
  };

  return { ...s, addAsset, removeAsset, updateAsset, totalWeight, runOptimize };
}
