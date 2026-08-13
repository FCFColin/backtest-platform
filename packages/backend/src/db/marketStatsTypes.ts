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

interface TickerRowState {
  earliest: string | null;
  latest: string | null;
  tickers5y: number;
  tickers10y: number;
  tickers20y: number;
  totalDataPoints: number;
  allPoints: number[];
}

export interface MarketStatsAccumulators {
  byMarket: DbMarketStats['by_market'];
  byType: Record<string, number>;
  byExchange: Record<string, number>;
}

export interface MarketStatsRowAccumulators extends MarketStatsAccumulators {
  byDecade: Record<string, number>;
  byYearCount: Record<string, number>;
  sampleTickers: DbMarketStats['sample_tickers'];
  state: TickerRowState;
}

export interface ProcessTickerRowOpts extends MarketStatsRowAccumulators {
  row: TickerAggRow;
}

export interface DbEngineStatusResult {
  totalTickers: number;
  cachedTickers: number;
  lastUpdate: string | null;
}
