/** @file Rebalancing sensitivity analysis shared types */
import type { RebalanceFrequency } from '@backtest/shared/types';

export const REBALANCE_OPTIONS: { value: RebalanceFrequency; label: string; color: string }[] = [
  { value: 'daily', label: '每日', color: '#2b63b8' },
  { value: 'weekly', label: '每周', color: '#06b6d4' },
  { value: 'monthly', label: '每月', color: '#2e8b57' },
  { value: 'quarterly', label: '每季度', color: '#f97316' },
  { value: 'annual', label: '每年', color: '#c94a4a' },
];

export const TABS = [
  { key: 'scatter', label: 'Scatter' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'offset', label: 'Offset Curves' },
  { key: 'table', label: 'Table' },
];

export const FREQ_ORDER: Record<string, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  quarterly: 3,
  annual: 4,
};

export const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];

export const BASE_PARAMS = {
  rollingWindowMonths: 12,
  benchmarkTicker: '',
  extendedWithdrawalStats: false,
  cashflowLegs: [] as unknown[],
  oneTimeCashflows: [] as unknown[],
};

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

export interface BacktestParams {
  startDate: string;
  endDate: string;
  startingValue: number;
  baseCurrency: 'usd' | 'cny';
  adjustForInflation: boolean;
}

export interface Asset {
  ticker: string;
  weight: number;
}

export interface OffsetResult {
  offset: number;
  cagr: number;
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
