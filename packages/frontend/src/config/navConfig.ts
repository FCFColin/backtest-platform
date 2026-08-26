export const DIRECT_LINKS = [
  { to: '/data-engine', key: 'dataEngine' },
  { to: '/calculators', key: 'calculators' },
  { to: '/about', key: 'about' },
  { to: '/pricing', key: 'pricing' },
] as const;

export const NAV_GROUPS = [
  {
    key: 'backtest',
    items: [
      { to: '/', key: 'portfolioBacktest' },
      { to: '/backtest-optimizer', key: 'backtestOptimizer' },
      { to: '/rebalancing-sensitivity', key: 'rebalancingSensitivity' },
      { to: '/lumpsum-vs-dca', key: 'lumpsumVsDca' },
    ],
  },
  {
    key: 'analysisOptimization',
    items: [
      { to: '/analysis', key: 'assetAnalysis' },
      { to: '/factor-regression', key: 'factorRegression' },
      { to: '/pca', key: 'pca' },
      { to: '/optimizer', key: 'portfolioOptimize' },
      { to: '/efficient-frontier', key: 'efficientFrontier' },
      { to: '/monte-carlo', key: 'monteCarlo' },
      { to: '/goal-optimizer', key: 'goalOptimizer' },
      { to: '/letf-slippage', key: 'letfAnalysis' },
    ],
  },
  {
    key: 'tacticalSignal',
    items: [
      { to: '/tactical', key: 'tacticalAllocation' },
      { to: '/tactical-grid', key: 'tacticalGrid' },
      { to: '/signal-analyzer', key: 'signalAnalyzer' },
      { to: '/dual-signal', key: 'dualSignal' },
      { to: '/multi-signal', key: 'multiSignal' },
    ],
  },
] as const;

export const FOOTER_PRODUCT_LINKS = [
  { to: '/', labelKey: 'nav.portfolioBacktest' },
  { to: '/monte-carlo', labelKey: 'Monte Carlo' },
  { to: '/optimizer', labelKey: 'Optimizer' },
  { to: '/tactical', labelKey: 'Tactical' },
  { to: '/analysis', labelKey: 'Analysis Tools' },
  { to: '/efficient-frontier', labelKey: 'Efficient Frontier' },
  { to: '/factor-regression', labelKey: 'Factor Regression' },
] as const;
