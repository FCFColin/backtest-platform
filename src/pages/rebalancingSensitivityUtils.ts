import { useState } from 'react';
import type { RebalanceFrequency } from '../../shared/types';

export const REBALANCE_OPTIONS: { value: RebalanceFrequency; label: string; color: string }[] = [
  { value: 'daily', label: '每日', color: '#2b63b8' },
  { value: 'weekly', label: '每周', color: '#06b6d4' },
  { value: 'monthly', label: '每月', color: '#2e8b57' },
  { value: 'quarterly', label: '每季度', color: '#f97316' },
  { value: 'annual', label: '每年', color: '#c94a4a' },
];

export interface FreqResult {
  frequency: RebalanceFrequency;
  label: string;
  color: string;
  cagr: number;
  stdev: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  growthCurve?: Array<{ date: string; value: number }>;
}

export const TABS = [
  { key: 'scatter', label: 'Scatter' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'offset', label: 'Offset Curves' },
  { key: 'table', label: 'Table' },
];

const FREQ_ORDER: Record<string, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  quarterly: 3,
  annual: 4,
};

export const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];

const BASE_PARAMS = {
  rollingWindowMonths: 12,
  benchmarkTicker: '',
  extendedWithdrawalStats: false,
  cashflowLegs: [] as unknown[],
  oneTimeCashflows: [] as unknown[],
};

function buildBacktestBody(
  label: string,
  assets: Array<{ ticker: string; weight: number }>,
  freq: RebalanceFrequency,
  offset: number,
  params: {
    startDate: string;
    endDate: string;
    startingValue: number;
    baseCurrency: 'usd' | 'cny';
    adjustForInflation: boolean;
  },
) {
  return {
    portfolios: [
      {
        name: label,
        assets,
        rebalanceFrequency: freq,
        rebalanceOffset: offset,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: { ...params, ...BASE_PARAMS },
  };
}

function applyRebalanceBands(
  portfolios: Array<Record<string, unknown>>,
  absoluteBand: number | '',
  relativeBand: number | '',
) {
  if (absoluteBand === '' && relativeBand === '') return;
  portfolios[0].rebalanceBands = {
    enabled: true,
    absoluteBand: absoluteBand !== '' ? Number(absoluteBand) : undefined,
    relativeBand: relativeBand !== '' ? Number(relativeBand) : undefined,
  };
}

function extractFreqResult(
  json: unknown,
  freq: RebalanceFrequency,
  label: string,
  color: string,
): FreqResult {
  const data = (json as { data?: unknown })?.data ?? json;
  const p = (
    data as {
      portfolios?: Array<{
        statistics?: Record<string, number>;
        growthCurve?: Array<{ date: string; value: number }>;
      }>;
    }
  )?.portfolios?.[0];
  if (!p) throw new Error(`无结果 (${label})`);
  const stats = p.statistics ?? {};
  return {
    frequency: freq,
    label,
    color,
    cagr: stats.cagr ?? 0,
    stdev: stats.stdev ?? 0,
    maxDrawdown: stats.maxDrawdown ?? 0,
    sharpe: stats.sharpe ?? 0,
    sortino: stats.sortino ?? 0,
    growthCurve: p.growthCurve,
  };
}

async function fetchFreqResult(
  freq: RebalanceFrequency,
  assets: Array<{ ticker: string; weight: number }>,
  params: {
    startDate: string;
    endDate: string;
    startingValue: number;
    baseCurrency: 'usd' | 'cny';
    adjustForInflation: boolean;
  },
  absoluteBand: number | '',
  relativeBand: number | '',
): Promise<FreqResult> {
  const opt = REBALANCE_OPTIONS.find((o) => o.value === freq)!;
  const body = buildBacktestBody(opt.label, assets, freq, 0, params);
  applyRebalanceBands(
    body.portfolios as Array<Record<string, unknown>>,
    absoluteBand,
    relativeBand,
  );
  const res = await fetch('/api/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${opt.label})`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || `回测失败 (${opt.label})`);
  return extractFreqResult(json, freq, opt.label, opt.color);
}

async function fetchOffsetResult(
  offset: number,
  freq: RebalanceFrequency,
  assets: Array<{ ticker: string; weight: number }>,
  params: {
    startDate: string;
    endDate: string;
    startingValue: number;
    baseCurrency: 'usd' | 'cny';
    adjustForInflation: boolean;
  },
): Promise<{ offset: number; cagr: number }> {
  const body = buildBacktestBody(`offset-${offset}`, assets, freq, offset, params);
  const res = await fetch('/api/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { offset, cagr: 0 };
  const json = await res.json();
  return { offset, cagr: (json.data ?? json).portfolios?.[0]?.statistics?.cagr ?? 0 };
}

export interface RebalancingState {
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
  assets: Array<{ ticker: string; weight: number }>;
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
  offsetResults: Array<{ offset: number; cagr: number }>;
  isLoadingOffset: boolean;
  runSensitivity: () => Promise<void>;
  runOffsetScan: (freq: RebalanceFrequency) => Promise<void>;
}

export function useRebalancingState(): RebalancingState {
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
  const [assets, setAssets] = useState([
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FreqResult[]>([]);
  const [activeTab, setActiveTab] = useState('scatter');
  const [offsetFreq, setOffsetFreq] = useState<RebalanceFrequency>('monthly');
  const [offsetResults, setOffsetResults] = useState<Array<{ offset: number; cagr: number }>>([]);
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

  const params = { startDate, endDate, startingValue, baseCurrency, adjustForInflation };
  const validate = (): Array<{ ticker: string; weight: number }> | string => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return '请至少添加一个标的';
    if (Math.abs(totalWeight - 100) > 0.01) return '权重合计必须为 100%';
    if (selectedFreqs.length === 0) return '请至少选择一个调仓频率';
    return validAssets;
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

  const runOffsetScanInner = async (
    freq: RebalanceFrequency,
    validAssets: Array<{ ticker: string; weight: number }>,
  ) => {
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
