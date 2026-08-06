import type { MarketStats } from '@backtest/shared/types';

export type DbMarketStats = MarketStats;

export interface TickerAggRow {
  ticker: string;
  market: string;
  category: string;
  exchange: string;
  n_points: number;
  first_date: string | null;
  last_date: string | null;
}

export interface TickerRowState {
  earliest: string | null;
  latest: string | null;
  tickers5y: number;
  tickers10y: number;
  tickers20y: number;
  totalDataPoints: number;
  allPoints: number[];
}

export interface ProcessTickerRowOpts {
  row: TickerAggRow;
  byMarket: DbMarketStats['by_market'];
  byType: Record<string, number>;
  byExchange: Record<string, number>;
  byDecade: Record<string, number>;
  byYearCount: Record<string, number>;
  sampleTickers: DbMarketStats['sample_tickers'];
  state: TickerRowState;
}

export interface MarketStatsAccumulators {
  byMarket: DbMarketStats['by_market'];
  byType: Record<string, number>;
  byExchange: Record<string, number>;
}

export interface DbEngineStatusResult {
  totalTickers: number;
  cachedTickers: number;
  lastUpdate: string | null;
}
