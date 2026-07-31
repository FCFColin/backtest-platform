/**
 * 市场数据统计 — 从 PostgreSQL 聚合（替代 JSON 文件扫描）。
 * 合并自 marketStatsHelpers.ts + marketStorageStats.ts + marketStats.ts；P3-2 M-005：类型在 marketStatsTypes.ts，纯函数在 marketStatsHelpers.ts。
 * 本文件保留 DB 查询 + 进程内 TTL 缓存 + 公共 API 再导出。
 * RLS 说明：tickers/prices 为全局共享市场数据表，无 tenant_id 列，不启用 RLS，直连 getReadPool() 是正确设计。
 */
import { getReadPool } from './pool.js';
import { logger } from '../utils/logger.js';

// 再导出拆分后的类型与纯辅助函数，保持原公共 API 不变
export type {
  DbMarketStats,
  TickerAggRow,
  TickerRowState,
  ProcessTickerRowOpts,
  MarketStatsAccumulators,
  DbEngineStatusResult,
} from './marketStatsTypes.js';
export {
  bytesToMb,
  inferMarket,
  deriveExchangeFromTicker,
  inferType,
  decadeLabel,
  accumulateYearStats,
  updateMarketStats,
  processTickerRow,
  buildMarketStatsResult,
} from './marketStatsHelpers.js';

import type { DbMarketStats, TickerAggRow, DbEngineStatusResult } from './marketStatsTypes.js';
import { processTickerRow, buildMarketStatsResult } from './marketStatsHelpers.js';

// 进程内 TTL 缓存（避免每次请求都执行昂贵的聚合查询）

interface TtlCacheEntry<T> {
  data: T;
  expiresAt: number;
}
function makeTtlCache<T>(ttlMs: number) {
  let entry: TtlCacheEntry<T> | null = null;
  return {
    get: (): T | null => {
      if (entry && Date.now() < entry.expiresAt) return entry.data;
      entry = null;
      return null;
    },
    set: (data: T): void => {
      entry = { data, expiresAt: Date.now() + ttlMs };
    },
    clear: (): void => {
      entry = null;
    },
  };
}

// 表空间占用统计
const MARKET_DATA_TABLES = ['tickers', 'prices', 'cpi_data', 'exchange_rates'] as const;

/** 查询行情相关 PostgreSQL 表的实际磁盘占用（含 TOAST 与索引）。查询失败返回 0。 */
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

/** 进程内 TTL 缓存：scanMarketStatsFromDb() 结果缓存 60 秒 */
const marketStatsCache = makeTtlCache<DbMarketStats>(60_000);

/** 从 PostgreSQL tickers + prices 聚合数据引擎统计。结果缓存 60 秒；数据库不可用返回 null。 */
export async function scanMarketStatsFromDb(force = false): Promise<DbMarketStats | null> {
  if (!force) {
    const cached = marketStatsCache.get();
    if (cached) return cached;
  }
  try {
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
    const result = buildMarketStatsResult({
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
    marketStatsCache.set(result);
    return result;
  } catch (err) {
    logger.warn({ err: err as Error }, '[marketStats] PostgreSQL 统计聚合失败');
    return null;
  }
}

/** 进程内 TTL 缓存：getLastUpdated() 结果缓存 30 秒 */
const lastUpdatedCache = makeTtlCache<string>(30_000);

/** 轻量查询：MAX(updated_at) FROM tickers（避免聚合开销）。缓存 30 秒。 */
export async function getLastUpdated(): Promise<string> {
  const cached = lastUpdatedCache.get();
  if (cached !== null) return cached;
  try {
    const { rows } = await getReadPool().query<{ last: Date | null }>(
      'SELECT MAX(updated_at) AS last FROM tickers',
    );
    const result = rows[0]?.last ? new Date(rows[0].last).toISOString() : '';
    lastUpdatedCache.set(result);
    return result;
  } catch {
    return '';
  }
}

/** 进程内 TTL 缓存：getDbEngineStatus() 结果缓存 30 秒（避免 COUNT(DISTINCT ticker) 在大表上的扫描开销） */
const dbEngineStatusCache = makeTtlCache<DbEngineStatusResult>(30_000);

/** 引擎状态摘要（PostgreSQL）：tickers 总数 / 已缓存数 / 最后更新时间；查询失败各字段归零。 */
export async function getDbEngineStatus(): Promise<DbEngineStatusResult> {
  const cached = dbEngineStatusCache.get();
  if (cached) return cached;
  try {
    const { rows } = await getReadPool().query<{
      total: string;
      with_prices: string;
      last_update: Date | null;
    }>(
      `SELECT (SELECT COUNT(*)::text FROM tickers) AS total, (SELECT COUNT(DISTINCT ticker)::text FROM prices) AS with_prices, (SELECT MAX(updated_at) FROM tickers) AS last_update`,
    );
    const row = rows[0];
    const result = {
      totalTickers: parseInt(row?.total ?? '0', 10),
      cachedTickers: parseInt(row?.with_prices ?? '0', 10),
      lastUpdate: row?.last_update ? new Date(row.last_update).toISOString() : null,
    };
    dbEngineStatusCache.set(result);
    return result;
  } catch {
    return { totalTickers: 0, cachedTickers: 0, lastUpdate: null };
  }
}

// 测试专用：清空所有 TTL 缓存（避免测试间缓存污染导致脏数据；生产代码不应调用）
export function __clearCachesForTests(): void {
  marketStatsCache.clear();
  lastUpdatedCache.clear();
  dbEngineStatusCache.clear();
}
