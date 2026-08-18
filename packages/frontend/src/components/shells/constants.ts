export const TOOL_LINKS = {
  backtest: { titleKey: 'nav.portfolioBacktest', href: '/' } as const,
  optimizer: { titleKey: 'nav.portfolioOptimize', href: '/optimizer' } as const,
  efficientF: { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' } as const,
  analysis: { titleKey: 'nav.assetAnalysis', href: '/analysis' } as const,
  monteCarlo: { titleKey: 'nav.monteCarlo', href: '/monte-carlo' } as const,
  pca: { titleKey: 'nav.pca', href: '/pca' } as const,
  goalOptimizer: { titleKey: 'nav.goalOptimizer', href: '/goal-optimizer' } as const,
  letf: { titleKey: 'nav.letf', href: '/letf' } as const,
  tactical: { titleKey: 'nav.tactical', href: '/tactical' } as const,
  rebalancing: {
    titleKey: 'nav.rebalancingSensitivity',
    href: '/rebalancing-sensitivity',
  } as const,
  factorRegression: {
    titleKey: 'nav.factorRegression',
    href: '/factor-regression',
  } as const,
} as const;
