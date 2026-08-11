import { lazyNamed } from '@/utils/lazyImport';

const loaders = {
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

export type PageName = keyof typeof loaders;

const preloaders: Record<string, () => Promise<unknown>> = {
  ...loaders,
  'tactical-grid': () => import('@/pages/tactical/TacticalPage'),
  'dual-signal': () => import('@/pages/signal/SignalAnalyzerPage'),
  'multi-signal': () => import('@/pages/signal/SignalAnalyzerPage'),
};

export const preloadPage = (name: string): void => {
  preloaders[name]?.().catch(() => {});
};

export const PAGE_LOADERS = Object.fromEntries(
  Object.entries(loaders).map(([k, v]) => [k, lazyNamed(v, 'default')]),
);
