/** @file Navigation group configuration */

export const NAV_GROUP_KEYS = [
  {
    key: 'backtest',
    items: [
      { to: '/', key: 'portfolioBacktest' },
      { to: '/backtest-optimizer', key: 'backtestOptimizer' },
      { to: '/rebalancing-sensitivity', key: 'rebalancingSensitivity' },
    ],
  },
  {
    key: 'analysis',
    items: [
      { to: '/analysis', key: 'assetAnalysis' },
      { to: '/factor-regression', key: 'factorRegression' },
      { to: '/pca', key: 'pca' },
    ],
  },
  {
    key: 'optimize',
    items: [
      { to: '/optimizer', key: 'portfolioOptimize' },
      { to: '/efficient-frontier', key: 'efficientFrontier' },
      { to: '/monte-carlo', key: 'monteCarlo' },
      { to: '/goal-optimizer', key: 'goalOptimizer' },
    ],
  },
  {
    key: 'tactical',
    items: [
      { to: '/tactical', key: 'tacticalAllocation' },
      { to: '/tactical-grid', key: 'tacticalGrid' },
      { to: '/signal-analyzer', key: 'signalAnalyzer' },
      { to: '/dual-signal', key: 'dualSignal' },
      { to: '/multi-signal', key: 'multiSignal' },
    ],
  },
  {
    key: 'more',
    items: [
      { to: '/lumpsum-vs-dca', key: 'lumpsumVsDca' },
      { to: '/letf-slippage', key: 'letfSlippage' },
      { to: '/calculators', key: 'calculators' },
      { to: '/data-engine', key: 'dataEngine' },
    ],
  },
] as const;
