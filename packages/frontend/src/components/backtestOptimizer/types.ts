import type { RebalanceFrequency } from '@backtest/shared/types';

export type Objective = 'maxCagr' | 'minMaxDrawdown' | 'maxSharpe' | 'maxSortino';

export interface OptimizeResultItem {
  rebalanceFrequency: RebalanceFrequency;
  rebalanceThreshold?: number;
  initialCapital: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  stdev: number;
  calmar: number;
}

export interface BestResultItem extends OptimizeResultItem {
  growthCurve: Array<{ date: string; value: number }>;
}

export interface OptimizerState {
  assets: Array<{ ticker: string; weight: string }>;
  frequencies: RebalanceFrequency[];
  thrMin: string;
  thrMax: string;
  thrStep: string;
  capMin: string;
  capMax: string;
  capStep: string;
  objective: Objective;
  enableMaxDD: boolean;
  maxDD: string;
  enableMinCagr: boolean;
  minCagr: string;
  startDate: string;
  endDate: string;
  benchmarkTicker: string;
  isLoading: boolean;
  error: string | null;
  results: OptimizeResultItem[] | null;
  best: BestResultItem | null;
  benchmarkGrowth: Array<{ date: string; value: number }> | null;
  totalCombos: number;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string) => void;
  toggleFreq: (freq: RebalanceFrequency) => void;
  setObjective: (v: Objective) => void;
  setEnableMaxDD: (v: boolean) => void;
  setMaxDD: (v: string) => void;
  setEnableMinCagr: (v: boolean) => void;
  setMinCagr: (v: string) => void;
  setThrMin: (v: string) => void;
  setThrMax: (v: string) => void;
  setThrStep: (v: string) => void;
  setCapMin: (v: string) => void;
  setCapMax: (v: string) => void;
  setCapStep: (v: string) => void;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  setBenchmarkTicker: (v: string) => void;
  runOptimize: () => Promise<void>;
}
