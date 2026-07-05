import { useState } from 'react';
import { useAsyncAction } from './useAsyncAction';
import { useToastStore } from '@/store/toastStore';
import type {
  FactorRegressionResult,
  AssetItem,
  ReturnFrequency,
} from '../components/factorRegression/types.js';
import { fetchRegression, generateMockRegression } from '../components/factorRegression/utils.js';

export function useFactorRegressionState() {
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [returnFrequency, setReturnFrequency] = useState<ReturnFrequency>('monthly');
  const [rfSource, setRfSource] = useState('us-3m');
  const [selectedFactors, setSelectedFactors] = useState<string[]>(['mktRF', 'smb', 'hml']);
  const [assets, setAssets] = useState<AssetItem[]>([
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ]);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [result, setResult] = useState<FactorRegressionResult | null>(null);

  const toggleFactor = (key: string) =>
    setSelectedFactors((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key],
    );
  const addAsset = () => setAssets([...assets, { ticker: '', weight: 0 }]);
  const removeAsset = (i: number) => setAssets(assets.filter((_, idx) => idx !== i));
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...assets];
    next[i] = { ...next[i], [field]: val };
    setAssets(next);
  };
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);

  const runRegression = () => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) {
      setError('请至少添加一个标的');
      return;
    }
    if (Math.abs(totalWeight - 100) > 0.01) {
      setError('权重合计必须为 100%');
      return;
    }
    if (selectedFactors.length === 0) {
      setError('请至少选择一个因子');
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
      } catch {
        setResult(generateMockRegression(selectedFactors, returnFrequency));
        setError(null);
        useToastStore.getState().addToast('warning', '因子回归 API 不可用，使用模拟数据');
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
