import { useState } from 'react';
import type { RebalanceFrequency } from '@backtest/shared/types';
import type { Objective, OptimizerState } from '../components/backtestOptimizer/types.js';
import { buildOptimizeBody } from '../components/backtestOptimizer/utils.js';

export function useBacktestOptimizerState(): OptimizerState {
  const [assets, setAssets] = useState<Array<{ ticker: string; weight: string }>>([
    { ticker: 'VTI', weight: '60' },
    { ticker: 'BND', weight: '40' },
  ]);
  const [frequencies, setFrequencies] = useState<RebalanceFrequency[]>(['quarterly']);
  const [thrMin, setThrMin] = useState('5');
  const [thrMax, setThrMax] = useState('20');
  const [thrStep, setThrStep] = useState('5');
  const [capMin, setCapMin] = useState('10000');
  const [capMax, setCapMax] = useState('10000');
  const [capStep, setCapStep] = useState('1000');
  const [objective, setObjective] = useState<Objective>('maxSharpe');
  const [enableMaxDD, setEnableMaxDD] = useState(false);
  const [maxDD, setMaxDD] = useState('20');
  const [enableMinCagr, setEnableMinCagr] = useState(false);
  const [minCagr, setMinCagr] = useState('5');
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [benchmarkTicker, setBenchmarkTicker] = useState('VTI');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OptimizerState['results']>(null);
  const [best, setBest] = useState<OptimizerState['best']>(null);
  const [benchmarkGrowth, setBenchmarkGrowth] = useState<OptimizerState['benchmarkGrowth']>(null);
  const [totalCombos, setTotalCombos] = useState(0);

  const addAsset = () => setAssets([...assets, { ticker: '', weight: '' }]);
  const removeAsset = (i: number) => {
    if (assets.length > 1) setAssets(assets.filter((_, idx) => idx !== i));
  };
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string) => {
    const next = [...assets];
    next[i] = { ...next[i], [field]: val };
    setAssets(next);
  };
  const toggleFreq = (freq: RebalanceFrequency) => {
    setFrequencies((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq],
    );
  };

  const runOptimize = async () => {
    const validAssets = assets.filter((a) => a.ticker.trim());
    if (validAssets.length === 0) {
      setError('请至少输入一个标的代码');
      return;
    }
    if (frequencies.length === 0) {
      setError('请至少选择一个再平衡频率');
      return;
    }
    setIsLoading(true);
    setError(null);
    setResults(null);
    setBest(null);
    setBenchmarkGrowth(null);
    try {
      const body = buildOptimizeBody(
        validAssets,
        frequencies,
        { thrMin, thrMax, thrStep, capMin, capMax, capStep },
        { startDate, endDate, benchmarkTicker },
        { objective, enableMaxDD, maxDD, enableMinCagr, minCagr },
      );
      const res = await fetch('/api/backtest-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '优化失败');
      const data = json.data;
      setResults(data.results ?? []);
      setBest(data.best ?? null);
      setBenchmarkGrowth(data.benchmarkGrowth ?? null);
      setTotalCombos(data.totalCombinations ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '优化失败');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    assets,
    frequencies,
    thrMin,
    thrMax,
    thrStep,
    capMin,
    capMax,
    capStep,
    objective,
    enableMaxDD,
    maxDD,
    enableMinCagr,
    minCagr,
    startDate,
    endDate,
    benchmarkTicker,
    isLoading,
    error,
    results,
    best,
    benchmarkGrowth,
    totalCombos,
    addAsset,
    removeAsset,
    updateAsset,
    toggleFreq,
    setObjective,
    setEnableMaxDD,
    setMaxDD,
    setEnableMinCagr,
    setMinCagr,
    setThrMin,
    setThrMax,
    setThrStep,
    setCapMin,
    setCapMax,
    setCapStep,
    setStartDate,
    setEndDate,
    setBenchmarkTicker,
    runOptimize,
  };
}
