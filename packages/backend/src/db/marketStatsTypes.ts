/**
 * 市场数据统计 — 类型定义。
 *
 * 从 marketStats.ts 拆分（P3-2 M-005）：将纯类型集中到本文件，便于跨模块复用。
 *
 * RLS 说明：本模块查询 tickers / prices 等全局共享市场数据表，不含 tenant_id 列，
 * 不启用 RLS。直连 getReadPool() 是正确设计。
 */
import type { MarketStats } from '@backtest/shared/types';

/** PostgreSQL 聚合后的市场统计快照（MarketStats 别名）。 */
export type DbMarketStats = MarketStats;

/** ticker 聚合行（来自 PostgreSQL 查询） */
export interface TickerAggRow {
  ticker: string;
  market: string;
  category: string;
  exchange: string;
  n_points: number;
  first_date: string | null;
  last_date: string | null;
}

/** processTickerRow 的累加器状态 */
export interface TickerRowState {
  earliest: string | null;
  latest: string | null;
  tickers5y: number;
  tickers10y: number;
  tickers20y: number;
  totalDataPoints: number;
  allPoints: number[];
}

/** processTickerRow 的全部参数 */
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

/**
 * 按维度分组的统计累加器（updateMarketStats 用）。
 *
 * 将 byMarket / byType / byExchange 三个累加器聚合为单一对象，降至 4 个参数。
 */
export interface MarketStatsAccumulators {
  byMarket: DbMarketStats['by_market'];
  byType: Record<string, number>;
  byExchange: Record<string, number>;
}

/** 引擎状态摘要查询结果 */
export interface DbEngineStatusResult {
  totalTickers: number;
  cachedTickers: number;
  lastUpdate: string | null;
}
