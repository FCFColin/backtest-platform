import type { Portfolio, PortfolioResult } from '@backtest/shared';

export interface TabCtx {
  pf: PortfolioResult[];
  pfs: Portfolio[];
  r: {
    assetTickers?: string[];
    assetCorrelations?: number[][];
    correlations?: number[][];
    portfolios?: PortfolioResult[];
  };
}
