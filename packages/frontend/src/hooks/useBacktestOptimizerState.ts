import { useState } from 'react';
import type { RebalanceFrequency } from '@backtest/shared';
import type { Objective, OptimizerState } from '../components/backtestOptimizer/types.js';
import { buildOptimizeBody } from '../components/backtestOptimizer/utils.js';

function useBacktestOptimizerStateInner() {
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
  return {
    assets,
    setAssets,
    frequencies,
    setFrequencies,
    thrMin,
    setThrMin,
    thrMax,
    setThrMax,
    thrStep,
    setThrStep,
    capMin,
    setCapMin,
    capMax,
    setCapMax,
    capStep,
    setCapStep,
    objective,
    setObjective,
    enableMaxDD,
    setEnableMaxDD,
    maxDD,
    setMaxDD,
    enableMinCagr,
    setEnableMinCagr,
    minCagr,
    setMinCagr,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    benchmarkTicker,
    setBenchmarkTicker,
    isLoading,
    setIsLoading,
    error,
    setError,
    results,
    setResults,
    best,
    setBest,
    benchmarkGrowth,
    setBenchmarkGrowth,
    totalCombos,
    setTotalCombos,
  };
}

export function useBacktestOptimizerState(): OptimizerState {
  const s = useBacktestOptimizerStateInner();

  const addAsset = () => s.setAssets([...s.assets, { ticker: '', weight: '' }]);
  const removeAsset = (i: number) => {
    if (s.assets.length > 1) s.setAssets(s.assets.filter((_, idx) => idx !== i));
  };
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string) => {
    const next = [...s.assets];
    next[i] = { ...next[i], [field]: val };
    s.setAssets(next);
  };
  const toggleFreq = (freq: RebalanceFrequency) => {
    s.setFrequencies((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq],
    );
  };

  const runOptimize = async () => {
    const validAssets = s.assets.filter((a) => a.ticker.trim());
    if (validAssets.length === 0) {
      s.setError('请至少输入一个标的代码');
      return;
    }
    if (s.frequencies.length === 0) {
      s.setError('请至少选择一个再平衡频率');
      return;
    }
    s.setIsLoading(true);
    s.setError(null);
    s.setResults(null);
    s.setBest(null);
    s.setBenchmarkGrowth(null);
    try {
      const body = buildOptimizeBody(
        validAssets,
        s.frequencies,
        {
          thrMin: s.thrMin,
          thrMax: s.thrMax,
          thrStep: s.thrStep,
          capMin: s.capMin,
          capMax: s.capMax,
          capStep: s.capStep,
        },
        { startDate: s.startDate, endDate: s.endDate, benchmarkTicker: s.benchmarkTicker },
        {
          objective: s.objective,
          enableMaxDD: s.enableMaxDD,
          maxDD: s.maxDD,
          enableMinCagr: s.enableMinCagr,
          minCagr: s.minCagr,
        },
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
      s.setResults(data.results ?? []);
      s.setBest(data.best ?? null);
      s.setBenchmarkGrowth(data.benchmarkGrowth ?? null);
      s.setTotalCombos(data.totalCombinations ?? 0);
    } catch (e) {
      s.setError(e instanceof Error ? e.message : '优化失败');
    } finally {
      s.setIsLoading(false);
    }
  };

  return { ...s, addAsset, removeAsset, updateAsset, toggleFreq, runOptimize };
}
