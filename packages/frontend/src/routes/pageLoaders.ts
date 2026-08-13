import { lazyNamed } from '@/utils/lazyImport';

const importers = {
  backtest: () => import('@/pages/backtest/BacktestPage'),
  analysis: () => import('@/pages/analysis/AnalysisResults'),
  'monte-carlo': () => import('@/pages/monte-carlo/MonteCarloResults'),
  optimizer: () => import('@/pages/optimizer/OptimizerPage'),
  'efficient-frontier': () => import('@/pages/efficient-frontier/EfficientFrontierResults'),
  'rebalancing-sensitivity': () =>
    import('@/pages/rebalancing-sensitivity/RebalancingSensitivityPage'),
  'lumpsum-vs-dca': () => import('@/pages/lump-sum-dca/LumpSumVsDCAPage'),
  'factor-regression': () => import('@/pages/factor-regression/FactorRegressionPage'),
  calculators: () => import('@/pages/calculators/BaseCalculatorUI'),
  tactical: () => import('@/pages/tactical/TacticalPage'),
  'backtest-optimizer': () => import('@/pages/backtest/BacktestOptimizerPage'),
  pca: () => import('@/pages/pca/PCAPage'),
  'signal-analyzer': () => import('@/pages/signal/SignalAnalyzerPage'),
  'letf-slippage': () => import('@/pages/letf/LETFSlippagePage'),
  'goal-optimizer': () => import('@/pages/goal-optimizer/GoalOptimizerResults'),
} as const;

export type PageName = keyof typeof importers;

export const PAGE_LOADERS = Object.fromEntries(
  Object.entries(importers).map(([k, v]) => [k, lazyNamed(v, 'default')]),
);

export const TacticalGridPage = lazyNamed(importers.tactical, 'TacticalGridPage');
export const DualSignalPage = lazyNamed(importers['signal-analyzer'], 'DualSignalPage');
export const MultiSignalPage = lazyNamed(importers['signal-analyzer'], 'MultiSignalPage');

const preloadAliases: Record<string, PageName> = {
  'tactical-grid': 'tactical',
  'dual-signal': 'signal-analyzer',
  'multi-signal': 'signal-analyzer',
};

export const preloadPage = (name: string): void => {
  importers[(preloadAliases[name] ?? name) as PageName]?.().catch(() => {});
};
