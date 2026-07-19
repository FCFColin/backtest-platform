import { useState } from 'react';
import type { RebalanceFrequency } from '@backtest/shared';
import { REBALANCE_FREQUENCIES, REBALANCE_FREQUENCY_COLORS } from '@backtest/shared';
import { apiFetch } from '@/utils/apiClient';
import { useListState } from '../../hooks/useListState.js';
import {
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  BASE_BACKTEST_PARAMS,
} from '@/utils/constants';
import { validateAssetWeights } from '@/utils/validation';

const REBALANCE_LABELS_ZH: Record<RebalanceFrequency, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  annual: '每年',
  none: '不调仓',
  threshold: '阈值',
};

export const REBALANCE_OPTIONS: { value: RebalanceFrequency; label: string; color: string }[] =
  REBALANCE_FREQUENCIES.map((value) => ({
    value,
    label: REBALANCE_LABELS_ZH[value],
    color: REBALANCE_FREQUENCY_COLORS[value],
  }));

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

const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];

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
    parameters: { ...params, ...BASE_BACKTEST_PARAMS },
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
  const res = await apiFetch('/api/v1/backtest/portfolio', {
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
  const res = await apiFetch('/api/v1/backtest/portfolio', {
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

function useRebalSetters() {
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FreqResult[]>([]);
  const [activeTab, setActiveTab] = useState('scatter');
  const [offsetFreq, setOffsetFreq] = useState<RebalanceFrequency>('monthly');
  const [offsetResults, setOffsetResults] = useState<Array<{ offset: number; cagr: number }>>([]);
  const [isLoadingOffset, setIsLoadingOffset] = useState(false);
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
    setSelectedFreqs,
    absoluteBand,
    setAbsoluteBand,
    relativeBand,
    setRelativeBand,
    isLoading,
    setIsLoading,
    error,
    setError,
    results,
    setResults,
    activeTab,
    setActiveTab,
    offsetFreq,
    setOffsetFreq,
    offsetResults,
    setOffsetResults,
    isLoadingOffset,
    setIsLoadingOffset,
  };
}

function createRebalancingRunners(
  s: ReturnType<typeof useRebalSetters>,
  params: {
    startDate: string;
    endDate: string;
    startingValue: number;
    baseCurrency: 'usd' | 'cny';
    adjustForInflation: boolean;
  },
  assets: Array<{ ticker: string; weight: number }>,
) {
  const validate = (): Array<{ ticker: string; weight: number }> | string => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return '请至少添加一个标的';
    const weightErr = validateAssetWeights(assets);
    if (weightErr) return weightErr;
    if (s.selectedFreqs.length === 0) return '请至少选择一个调仓频率';
    return validAssets;
  };

  const runOffsetScanInner = async (
    freq: RebalanceFrequency,
    validAssets: Array<{ ticker: string; weight: number }>,
  ) => {
    s.setIsLoadingOffset(true);
    s.setOffsetResults([]);
    try {
      s.setOffsetResults(
        await Promise.all(OFFSETS.map((o) => fetchOffsetResult(o, freq, validAssets, params))),
      );
    } catch {
      s.setError('再平衡敏感性分析失败');
    } finally {
      s.setIsLoadingOffset(false);
    }
  };

  const runSensitivity = async () => {
    const validAssets = validate();
    if (typeof validAssets === 'string') {
      s.setError(validAssets);
      return;
    }
    s.setIsLoading(true);
    s.setError(null);
    s.setResults([]);
    s.setOffsetResults([]);
    try {
      const all = await Promise.all(
        s.selectedFreqs.map((f) =>
          fetchFreqResult(f, validAssets, params, s.absoluteBand, s.relativeBand),
        ),
      );
      all.sort((a, b) => FREQ_ORDER[a.frequency] - FREQ_ORDER[b.frequency]);
      s.setResults(all);
      if (s.selectedFreqs.length > 0) void runOffsetScanInner(s.selectedFreqs[0], validAssets);
    } catch (e) {
      s.setError(e instanceof Error ? e.message : '分析失败');
    } finally {
      s.setIsLoading(false);
    }
  };

  const runOffsetScan = async (freq: RebalanceFrequency) => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return;
    await runOffsetScanInner(freq, validAssets);
  };

  return { runSensitivity, runOffsetScan };
}

export function useRebalancingState(): RebalancingState {
  const s = useRebalSetters();
  const toggleFreq = (freq: RebalanceFrequency) =>
    s.setSelectedFreqs((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq],
    );
  const {
    items: assets,
    addItem: addAsset,
    removeItem: removeAsset,
    updateItem,
  } = useListState<{ ticker: string; weight: number }>(
    [
      { ticker: 'VTI', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    () => ({ ticker: '', weight: 0 }),
    0,
  );
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string | number) =>
    updateItem(i, (prev) => ({ ...prev, [field]: val }));
  const totalWeight = assets.reduce((sum, a) => sum + (a.weight || 0), 0);
  const params = {
    startDate: s.startDate,
    endDate: s.endDate,
    startingValue: s.startingValue,
    baseCurrency: s.baseCurrency,
    adjustForInflation: s.adjustForInflation,
  };
  const { runSensitivity, runOffsetScan } = createRebalancingRunners(s, params, assets);

  // 内部 setter（setSelectedFreqs/setIsLoading/setError/setResults/setOffsetResults/
  // setIsLoadingOffset）随 spread 暴露到运行时但不在 RebalancingState 类型中，
  // TypeScript 结构类型允许返回对象包含额外字段，消费者无法经由类型系统访问这些内部字段。
  return {
    ...s,
    toggleFreq,
    assets,
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    runSensitivity,
    runOffsetScan,
  };
}
