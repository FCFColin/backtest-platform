import type { Portfolio, PortfolioResult } from '@backtest/shared/types';

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
