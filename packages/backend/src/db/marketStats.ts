/**
 * 从 PostgreSQL 聚合市场数据统计（替代 JSON 文件扫描）
 */
import { getReadPool } from './pool.js';
import { logger } from '../utils/logger.js';
import {
  type DbMarketStats,
  type TickerAggRow,
  buildMarketStatsResult,
  processTickerRow,
} from './marketStatsHelpers.js';
import { getMarketDataStorageBytes } from './marketStorageStats.js';

/**
 * 从 PostgreSQL tickers + prices 表聚合数据引擎统计。
 *
 * @returns 统计快照；数据库不可用时返回 null
 */
export async function scanMarketStatsFromDb(): Promise<DbMarketStats | null> {
  try {
    const pool = getReadPool();
    const { rows } = await pool.query<TickerAggRow>(`
      SELECT
        t.ticker,
        COALESCE(t.market, '') AS market,
        COALESCE(t.category, '') AS category,
        COALESCE(t.exchange, '') AS exchange,
        COUNT(p.date)::int AS n_points,
        MIN(p.date)::text AS first_date,
        MAX(p.date)::text AS last_date
      FROM tickers t
      INNER JOIN prices p ON p.ticker = t.ticker
      GROUP BY t.ticker, t.market, t.category, t.exchange
      HAVING COUNT(p.date) > 0
    `);

    if (rows.length === 0) return null;

    const byMarket: DbMarketStats['by_market'] = {};
    const byType: Record<string, number> = {};
    const byExchange: Record<string, number> = {};
    const byDecade: Record<string, number> = {};
    const byYearCount: Record<string, number> = {};
    const sampleTickers: DbMarketStats['sample_tickers'] = {
      us_stock: [],
      us_etf: [],
      cn_stock: [],
      cn_etf: [],
      index: [],
    };
    const state = {
      earliest: null as string | null,
      latest: null as string | null,
      tickers5y: 0,
      tickers10y: 0,
      tickers20y: 0,
      totalDataPoints: 0,
      allPoints: [] as number[],
    };

    for (const row of rows) {
      processTickerRow({
        row,
        byMarket,
        byType,
        byExchange,
        byDecade,
        byYearCount,
        sampleTickers,
        state,
      });
    }

    const storageBytes = await getMarketDataStorageBytes();

    return buildMarketStatsResult({
      rows,
      byMarket,
      byType,
      byExchange,
      byDecade,
      byYearCount,
      sampleTickers,
      state,
      allPoints: state.allPoints,
      storageBytes,
    });
  } catch (err) {
    logger.warn({ err: err as Error }, '[marketStats] PostgreSQL 统计聚合失败');
    return null;
  }
}

/**
 * 引擎状态摘要（PostgreSQL）
 *
 * @returns tickers 总数 / 已缓存 tickers 数 / 最后更新时间；查询失败时各字段归零
 */
export async function getDbEngineStatus(): Promise<{
  totalTickers: number;
  cachedTickers: number;
  lastUpdate: string | null;
}> {
  try {
    const pool = getReadPool();
    const { rows } = await pool.query<{
      total: string;
      with_prices: string;
      last_update: Date | null;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM tickers) AS total,
        (SELECT COUNT(DISTINCT ticker)::text FROM prices) AS with_prices,
        (SELECT MAX(updated_at) FROM tickers) AS last_update
    `);
    const row = rows[0];
    return {
      totalTickers: parseInt(row?.total ?? '0', 10),
      cachedTickers: parseInt(row?.with_prices ?? '0', 10),
      lastUpdate: row?.last_update ? new Date(row.last_update).toISOString() : null,
    };
  } catch {
    return { totalTickers: 0, cachedTickers: 0, lastUpdate: null };
  }
}
