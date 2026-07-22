import { isValidTicker } from '../utils/tickerValidation.js';
import { logger } from '../utils/logger.js';
import { toDateStr } from '../utils/dateUtils.js';
import { scanMarketStatsFromDb, getDbEngineStatus } from '../db/marketStats.js';
import type { DbMarketStats } from '../db/marketStatsHelpers.js';
import { getReadPool } from '../db/pool.js';

/** 获取引擎状态（PostgreSQL） */
export async function getEngineStatus(): Promise<{
  totalTickers: number;
  cachedTickers: number;
  lastUpdate: string | null;
  progress: Record<string, unknown> | null;
  universeAge: string | null;
}> {
  try {
    const db = await getDbEngineStatus();
    return {
      totalTickers: db.totalTickers,
      cachedTickers: db.cachedTickers,
      lastUpdate: db.lastUpdate,
      progress: null,
      universeAge: null,
    };
  } catch {
    return {
      totalTickers: 0,
      cachedTickers: 0,
      lastUpdate: null,
      progress: null,
      universeAge: null,
    };
  }
}

/** 获取标的列表（PostgreSQL） */
export async function getTickerList(): Promise<
  Array<{ ticker: string; name: string; category: string; market: string }>
> {
  try {
    const pool = getReadPool();
    const { rows } = await pool.query<{ ticker: string; category: string; market: string }>(
      'SELECT ticker, category, market FROM tickers ORDER BY ticker LIMIT 500',
    );
    return rows.map((r) => ({
      ticker: r.ticker,
      name: r.category || r.ticker,
      category: r.category || '',
      market: r.market || '',
    }));
  } catch (err) {
    logger.warn({ err: err as Error }, '[tickerDataService] getTickerList: PostgreSQL 查询失败');
    return [];
  }
}

/** 搜索标的 — 统一使用 dataFacade.searchTickers（DB 全文搜索 + Go fallback） */
export { searchTickers } from './dataFacade.js';

/** 加载标的数据（PostgreSQL） */
export async function loadTickerData(ticker: string): Promise<Record<string, unknown> | null> {
  if (!isValidTicker(ticker)) {
    logger.warn(`[tickerDataService] loadTickerData: 拒绝非法 ticker: ${ticker}`);
    return null;
  }

  try {
    const pool = getReadPool();
    const { rows } = await pool.query<{
      date: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      adjusted_close: number | null;
    }>(
      `SELECT date, open, high, low, close, volume, adjusted_close
       FROM prices WHERE ticker = $1 ORDER BY date`,
      [ticker],
    );
    if (rows.length === 0) return null;

    const prices = rows.map((r) => ({
      date: toDateStr(r.date),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      adj_close: r.adjusted_close ?? r.close,
    }));

    return {
      meta: { ticker },
      prices,
    };
  } catch (err) {
    logger.warn(
      { err: err as Error, ticker },
      '[tickerDataService] loadTickerData: PostgreSQL 查询失败',
    );
    return null;
  }
}

/** 从数据库获取统计（替代 JSON 缓存） */
export function scanTickersStats(_force = false): Promise<DbMarketStats | null> {
  return scanMarketStatsFromDb();
}

/** 从数据库统计推导宇宙规模 */
export function resolveUniverseFromCacheStats(stats: DbMarketStats | null): {
  total: number;
  updated_at: string;
  stats: Record<string, number>;
} {
  if (!stats || stats.total_cached <= 0) {
    return { total: 0, updated_at: '', stats: {} };
  }

  const us = stats.by_market?.US?.count ?? 0;
  const cn = stats.by_market?.CN?.count ?? 0;
  const stocks = stats.by_type?.STOCK ?? 0;
  const etfs = stats.by_type?.ETF ?? 0;
  const indices = Object.values(stats.by_market ?? {}).reduce(
    (sum, m) => sum + (m.indices ?? 0),
    0,
  );

  return {
    total: stats.total_cached,
    updated_at: stats.generated_at,
    stats: { total: stats.total_cached, stocks, etfs, indices, us, cn },
  };
}

/** 获取标的宇宙统计（从 PostgreSQL 统计推导） */
export async function getUniverseStats(): Promise<{
  total: number;
  updated_at: string;
  stats: Record<string, number>;
}> {
  const stats = await scanMarketStatsFromDb();
  return resolveUniverseFromCacheStats(stats);
}
