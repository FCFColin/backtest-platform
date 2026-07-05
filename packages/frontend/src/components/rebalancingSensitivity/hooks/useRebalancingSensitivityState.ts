/** @file Rebalancing sensitivity state management hook */
import { useState } from 'react';
import type { RebalanceFrequency } from '@backtest/shared/types';
import type { FreqResult, OffsetResult, Asset, BacktestParams } from '../types.js';
import { FREQ_ORDER, OFFSETS } from '../types.js';
import { fetchFreqResult, fetchOffsetResult } from '../utils.js';

interface RebalancingState {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  adjustForInflation: boolean;
  setAdjustForInflation: (v: boolean) => void;
  baseCurrency: 'usd' | 'cny';
  setBaseCurrency: (v: 'usd' | 'cny') => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  selectedFreqs: RebalanceFrequency[];
  toggleFreq: (f: RebalanceFrequency) => void;
  absoluteBand: number | '';
  setAbsoluteBand: (v: number | '') => void;
  relativeBand: number | '';
  setRelativeBand: (v: number | '') => void;
  assets: Asset[];
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number;
  isLoading: boolean;
  error: string | null;
  results: FreqResult[];
  activeTab: string;
  setActiveTab: (v: string) => void;
  offsetFreq: RebalanceFrequency;
  setOffsetFreq: (v: RebalanceFrequency) => void;
  offsetResults: OffsetResult[];
  isLoadingOffset: boolean;
  runSensitivity: () => Promise<void>;
  runOffsetScan: (freq: RebalanceFrequency) => Promise<void>;
}

export function useRebalancingSensitivityState(): RebalancingState {
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState<'usd' | 'cny'>('usd');
  const [startingValue, setStartingValue] = useState(10000);
  const [selectedFreqs, setSelectedFreqs] = useState<RebalanceFrequency[]>([
    'monthly',
    'quarterly',
    'annual',
  ]);
  const [absoluteBand, setAbsoluteBand] = useState<number | ''>('');
  const [relativeBand, setRelativeBand] = useState<number | ''>('');
  const [assets, setAssets] = useState<Asset[]>([
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FreqResult[]>([]);
  const [activeTab, setActiveTab] = useState('scatter');
  const [offsetFreq, setOffsetFreq] = useState<RebalanceFrequency>('monthly');
  const [offsetResults, setOffsetResults] = useState<OffsetResult[]>([]);
  const [isLoadingOffset, setIsLoadingOffset] = useState(false);

  const toggleFreq = (freq: RebalanceFrequency) =>
    setSelectedFreqs((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq],
    );
  const addAsset = () => setAssets([...assets, { ticker: '', weight: 0 }]);
  const removeAsset = (i: number) => setAssets(assets.filter((_, idx) => idx !== i));
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string | number) => {
    const n = [...assets];
    n[i] = { ...n[i], [field]: val };
    setAssets(n);
  };
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);

  const params: BacktestParams = {
    startDate,
    endDate,
    startingValue,
    baseCurrency,
    adjustForInflation,
  };
  const validate = (): Asset[] | string => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return '请至少添加一个标的';
    if (Math.abs(totalWeight - 100) > 0.01) return '权重合计必须为 100%';
    if (selectedFreqs.length === 0) return '请至少选择一个调仓频率';
    return validAssets;
  };

  const runOffsetScanInner = async (freq: RebalanceFrequency, validAssets: Asset[]) => {
    setIsLoadingOffset(true);
    setOffsetResults([]);
    try {
      setOffsetResults(
        await Promise.all(OFFSETS.map((o) => fetchOffsetResult(o, freq, validAssets, params))),
      );
    } catch {
      setError('再平衡敏感性分析失败');
    } finally {
      setIsLoadingOffset(false);
    }
  };

  const runSensitivity = async () => {
    const validAssets = validate();
    if (typeof validAssets === 'string') {
      setError(validAssets);
      return;
    }
    setIsLoading(true);
    setError(null);
    setResults([]);
    setOffsetResults([]);
    try {
      const all = await Promise.all(
        selectedFreqs.map((f) =>
          fetchFreqResult(f, validAssets, params, absoluteBand, relativeBand),
        ),
      );
      all.sort((a, b) => FREQ_ORDER[a.frequency] - FREQ_ORDER[b.frequency]);
      setResults(all);
      if (selectedFreqs.length > 0) void runOffsetScanInner(selectedFreqs[0], validAssets);
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败');
    } finally {
      setIsLoading(false);
    }
  };

  const runOffsetScan = async (freq: RebalanceFrequency) => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return;
    await runOffsetScanInner(freq, validAssets);
  };

  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    adjustForInflation,
    setAdjustForInflation,
    baseCurrency,
    setBaseCurrency,
    startingValue,
    setStartingValue,
    selectedFreqs,
    toggleFreq,
    absoluteBand,
    setAbsoluteBand,
    relativeBand,
    setRelativeBand,
    assets,
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    isLoading,
    error,
    results,
    activeTab,
    setActiveTab,
    offsetFreq,
    setOffsetFreq,
    offsetResults,
    isLoadingOffset,
    runSensitivity,
    runOffsetScan,
  };
}
