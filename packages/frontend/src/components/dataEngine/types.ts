/** @file DataEngine shared types, constants */
import { useTranslation } from 'react-i18next';

export type TFunc = ReturnType<typeof useTranslation>['t'];

export interface Stats {
  generated_at: string;
  total_cached: number;
  by_market: Record<string, { count: number; stocks: number; etfs: number; indices: number }>;
  by_type: Record<string, number>;
  by_exchange: Record<string, number>;
  date_ranges: { earliest: string | null; latest: string | null };
  by_decade: Record<string, number>;
  by_year_count: Record<string, number>;
  coverage: {
    tickers_with_5y_plus: number;
    tickers_with_10y_plus: number;
    tickers_with_20y_plus: number;
    avg_data_points: number;
    median_data_points: number;
  };
  data_quality: {
    with_adj_close: number;
    with_dividends: number;
    with_splits: number;
    total_data_points: number;
    total_size_mb: number;
  };
  recent_updates: Array<{ ticker: string; name: string; updated: string }>;
  sample_tickers: Record<
    string,
    Array<{
      ticker: string;
      name: string;
      first_date: string;
      last_date: string;
      data_points: number;
    }>
  >;
}

export interface UniverseStats {
  total: number;
  updated_at: string;
  stats: { total: number; stocks: number; etfs: number; indices: number; us: number; cn: number };
}

export const MAX_POLL = 60;
export const INITIAL_TIMEOUT_MS = 15_000;
