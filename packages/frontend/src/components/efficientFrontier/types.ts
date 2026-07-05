import type { EfficientFrontierResult, EfficientFrontierPoint } from '@backtest/shared/types';

export type SolveSpeed = 'ultrafast' | 'fast' | 'medium' | 'slow';
export type FrontierSolver = 'markowitz' | 'nsga2';
export type ReturnObjective = 'maxCagr' | 'minVolatility';

export const REBALANCE_LABELS: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  yearly: '每年',
};

export const SOLVE_SPEED_OPTIONS = [
  { value: 'ultrafast', label: '极速' },
  { value: 'fast', label: '快速' },
  { value: 'medium', label: '中等' },
  { value: 'slow', label: '慢速' },
];

export const REBALANCE_FREQ_OPTIONS = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季度' },
  { value: 'yearly', label: '每年' },
];

export const RETURN_OBJ_OPTIONS = [
  { value: 'maxCagr', label: '最大化 CAGR' },
  { value: 'minVolatility', label: '最小化波动率' },
];

export const SOLVER_OPTIONS = [
  { value: 'markowitz', label: 'Markowitz' },
  { value: 'nsga2', label: 'NSGA-II' },
];

export interface FetchFrontierParams {
  validTickers: string[];
  numPoints: number;
  solveSpeed: SolveSpeed;
  minInclusionWeight: number;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  startDate: string;
  endDate: string;
}

export interface FrontierParamsProps {
  tickers: string[];
  startDate: string;
  endDate: string;
  numPoints: number;
  solveSpeed: SolveSpeed;
  minInclusionWeight: number;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  onAddTicker: () => void;
  onRemoveTicker: (i: number) => void;
  onUpdateTicker: (i: number, val: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onNumPointsChange: (v: number) => void;
  onSolveSpeedChange: (v: SolveSpeed) => void;
  onMinInclusionWeightChange: (v: number) => void;
  onRebalanceFrequencyChange: (v: string) => void;
  onAllowCashChange: (v: boolean) => void;
  onReturnObjectiveChange: (v: ReturnObjective) => void;
  onSolverChange: (v: FrontierSolver) => void;
  isLoading: boolean;
  onRun: () => void;
}

export interface FrontierResultsProps {
  results: EfficientFrontierResult;
  scatterData: Array<{
    expectedVolatility: number;
    expectedReturn: number;
    sharpeRatio: number;
    idx: number;
  }>;
  sharpeRange: { min: number; max: number };
  maxSharpe: EfficientFrontierPoint | undefined;
  allocationData: Record<string, number | string>[];
  allAssetTickers: string[];
  correlations: { tickers: string[]; matrix: number[][] } | null;
  correlationError: string | null;
  selectedPoint: EfficientFrontierPoint | null;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  onSelectPoint: (p: EfficientFrontierPoint) => void;
  onLoadInBacktester: (p?: EfficientFrontierPoint) => void;
}
