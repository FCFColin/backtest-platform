export type PortfolioMode = 1 | 2;
export type SimMode = 'standard' | 'frontier';

export interface PortfolioState {
  name: string;
  assets: { ticker: string; weight: number }[];
  rebalanceFrequency: string;
}

export type DistMetric =
  'finalValue' | 'cagr' | 'maxDrawdown' | 'volatility' | 'sharpe' | 'sortino';
export type ResultTab = 'summary' | 'range' | 'success' | 'distributions' | 'scenarios';
