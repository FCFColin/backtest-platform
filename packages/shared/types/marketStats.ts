/**
 * @file 市场数据统计共享类型
 * @description 后端 PostgreSQL 聚合结果与前端数据引擎面板共用的统计快照结构，
 *  鼓励 DRY，避免在 backend/frontend 各自维护一份同构 interface。
 */

/**
 * 市场数据统计快照。
 *
 * 由后端 `scanMarketStatsFromDb` 从 PostgreSQL 聚合生成，
 * 前端数据引擎面板直接消费同构 JSON。
 */
export interface MarketStats {
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
