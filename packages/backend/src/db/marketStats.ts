// tickers/prices 为全局共享市场数据表，无 tenant_id，不启用 RLS
import { getReadPool } from './pool.js';
import { logger } from '../utils/logger.js';
import { createTtlCache, withTtlCache } from '../utils/ttlCache.js';

export type { DbMarketStats } from './marketStatsTypes.js';
export { bytesToMb, inferMarket, deriveExchangeFromTicker } from './marketStatsHelpers.js';

import type { DbMarketStats, TickerAggRow, DbEngineStatusResult } from './marketStatsTypes.js';
import { processTickerRow, buildMarketStatsResult } from './marketStatsHelpers.js';

const MARKET_DATA_TABLES = ['tickers', 'prices', 'cpi_data', 'exchange_rates'] as const;

export async function getMarketDataStorageBytes(): Promise<number> {
  try {
    const { rows } = await getReadPool().query<{ total_bytes: string }>(
      `SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(c.relname)::regclass)), 0)::text AS total_bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
      [MARKET_DATA_TABLES],
    );
    return parseInt(rows[0]?.total_bytes ?? '0', 10) || 0;
  } catch (err) {
    logger.warn({ err: err as Error }, '[marketStats] 查询 PostgreSQL 表空间失败');
    return 0;
  }
}

const marketStatsCache = createTtlCache<DbMarketStats>(60_000);

export function scanMarketStatsFromDb(force = false): Promise<DbMarketStats | null> {
  return withTtlCache(
    marketStatsCache,
    'stats',
    async () => {
      const { rows } = await getReadPool().query<TickerAggRow>(
        `SELECT t.ticker, COALESCE(t.market, '') AS market, COALESCE(t.category, '') AS category, COALESCE(t.exchange, '') AS exchange, COUNT(p.date)::int AS n_points, MIN(p.date)::text AS first_date, MAX(p.date)::text AS last_date FROM tickers t INNER JOIN prices p ON p.ticker = t.ticker GROUP BY t.ticker, t.market, t.category, t.exchange HAVING COUNT(p.date) > 0`,
      );
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
      for (const row of rows)
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
    },
    { force },
  ).catch((err) => {
    logger.warn({ err: err as Error }, '[marketStats] PostgreSQL 统计聚合失败');
    return null;
  });
}

const lastUpdatedCache = createTtlCache<string>(30_000);

export async function getLastUpdated(): Promise<string> {
  const last = await withTtlCache(lastUpdatedCache, 'last', async () => {
    const { rows } = await getReadPool().query<{ last: Date | null }>(
      'SELECT MAX(updated_at) AS last FROM tickers',
    );
    return rows[0]?.last ? new Date(rows[0].last).toISOString() : '';
  }).catch(() => '');
  return last ?? '';
}

const dbEngineStatusCache = createTtlCache<DbEngineStatusResult>(30_000);

export async function getDbEngineStatus(): Promise<DbEngineStatusResult> {
  const status = await withTtlCache(dbEngineStatusCache, 'status', async () => {
    const { rows } = await getReadPool().query<{
      total: string;
      with_prices: string;
      last_update: Date | null;
    }>(
      `SELECT (SELECT COUNT(*)::text FROM tickers) AS total, (SELECT COUNT(DISTINCT ticker)::text FROM prices_monthly) AS with_prices, (SELECT MAX(updated_at) FROM tickers) AS last_update`,
    );
    const row = rows[0];
    return {
      totalTickers: parseInt(row?.total ?? '0', 10),
      cachedTickers: parseInt(row?.with_prices ?? '0', 10),
      lastUpdate: row?.last_update ? new Date(row.last_update).toISOString() : null,
    };
  }).catch(() => ({ totalTickers: 0, cachedTickers: 0, lastUpdate: null }));
  return status ?? { totalTickers: 0, cachedTickers: 0, lastUpdate: null };
}

export function __clearCachesForTests(): void {
  marketStatsCache.clear();
  lastUpdatedCache.clear();
  dbEngineStatusCache.clear();
}
