/** @file Optimizer shared types, constants */
import type { OptimizationResult, Statistics } from '@backtest/shared/types';

export type SolverType = 'markowitz' | 'ga';

export type OptimizerResultExt = OptimizationResult & {
  frontier?: Array<{ expectedReturn: number; expectedVolatility: number; sharpeRatio: number }>;
};

export const BASE_PARAMS = {
  startingValue: 10000,
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: '',
  baseCurrency: 'usd',
  extendedWithdrawalStats: false,
  cashflowLegs: [] as unknown[],
  oneTimeCashflows: [] as unknown[],
};

export const METRICS_ROWS: { key: keyof Statistics; label: string; fmt: 'pct' | 'num' }[] = [
  { key: 'cagr', label: 'CAGR', fmt: 'pct' },
  { key: 'stdev', label: 'Volatility', fmt: 'pct' },
  { key: 'maxDrawdown', label: 'Max Drawdown', fmt: 'pct' },
  { key: 'avgDrawdown', label: 'Avg Drawdown', fmt: 'pct' },
  { key: 'sharpe', label: 'Sharpe', fmt: 'num' },
  { key: 'sortino', label: 'Sortino', fmt: 'num' },
  { key: 'calmar', label: 'Calmar', fmt: 'num' },
  { key: 'ulcerIndex', label: 'Ulcer Index', fmt: 'num' },
  { key: 'ulcerPerformanceIndex', label: 'UPI', fmt: 'num' },
];

export interface OptimizerState {
  tickers: string[];
  setTickers: React.Dispatch<React.SetStateAction<string[]>>;
  objective: string;
  setObjective: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  minWeight: number;
  setMinWeight: (v: number) => void;
  maxWeight: number;
  setMaxWeight: (v: number) => void;
  tbillRate: number;
  setTbillRate: (v: number) => void;
  allowShort: boolean;
  setAllowShort: (v: boolean) => void;
  solver: SolverType;
  setSolver: (v: SolverType) => void;
  minCagr: string;
  setMinCagr: (v: string) => void;
  minSharpe: string;
  setMinSharpe: (v: string) => void;
  minSortino: string;
  setMinSortino: (v: string) => void;
  maxVol: string;
  setMaxVol: (v: string) => void;
  maxMaxDD: string;
  setMaxMaxDD: (v: string) => void;
  maxAvgDD: string;
  setMaxAvgDD: (v: string) => void;
  maxHoldings: string;
  setMaxHoldings: (v: string) => void;
  minWeightToInclude: string;
  setMinWeightToInclude: (v: string) => void;
  enableMaxDD: boolean;
  setEnableMaxDD: (v: boolean) => void;
  enableMinCagr: boolean;
  setEnableMinCagr: (v: boolean) => void;
  enableMaxVol: boolean;
  setEnableMaxVol: (v: boolean) => void;
  isLoading: boolean;
  isCalculatingStats: boolean;
  error: string | null;
  results: OptimizerResultExt | null;
  backtestStats: Statistics | null;
  runOptimize: () => Promise<void>;
  handleLoadInBacktester: () => void;
}
