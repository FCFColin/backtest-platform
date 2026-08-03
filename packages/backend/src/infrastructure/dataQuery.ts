/** 市场数据查询模块（价格 / Ticker 搜索 + ticker 元数据服务）。prices/tickers 全局共享无 RLS，直连 getReadPool() 正确（P0-03）。P0-03：限制 Go 服务响应体大小防 OOM。 */
import CircuitBreaker from 'opossum';
import { logger } from '../utils/logger.js';
import { toDateStr } from '../utils/misc.js';
import { getReadPool } from '../db/pool.js';
import { registerCircuitBreakerMetrics } from '../utils/metrics.js';
import { isValidTicker } from '../utils/tickerValidation.js';
import {
  writeCache,
  setPriceCache,
  getCacheKey,
  readCache,
  HISTORY_CACHE_TTL_SEC,
  SEARCH_CACHE_TTL_SEC,
} from './dataCache.js';
import { callGoDataService } from './goDataServiceClient.js';
import { scanMarketStatsFromDb, getDbEngineStatus, type DbMarketStats } from '../db/marketStats.js';

interface TickerSearchResult {
  ticker: string;
  name: string;
  market: string;
}

const pgCircuitBreaker = new CircuitBreaker(
  async (queryText: string, params?: unknown[]) => getReadPool().query(queryText, params),
  {
    name: 'postgres',
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 10000,
    volumeThreshold: 5,
    rollingCountTimeout: 60000,
    rollingCountBuckets: 6,
  },
);
pgCircuitBreaker.on('open', () =>
  logger.warn('[dataService] PostgreSQL 熔断器 OPEN：后续查询将失败直至恢复'),
);
pgCircuitBreaker.on('halfOpen', () =>
  logger.info('[dataService] PostgreSQL 熔断器 HALF-OPEN：放行探测查询'),
);
pgCircuitBreaker.on('close', () =>
  logger.info('[dataService] PostgreSQL 熔断器 CLOSED：PostgreSQL 恢复正常'),
);
registerCircuitBreakerMetrics('postgres', pgCircuitBreaker);

function isDbAvailable(): boolean {
  return !pgCircuitBreaker.opened;
}

async function computeCommonDateRange(
  validTickers: string[],
  hasUnknownTickers: boolean,
): Promise<{ start: string; end: string } | null> {
  const { rows: rangeRows } = await pgCircuitBreaker.fire(
    'SELECT ticker, MIN(date) as first, MAX(date) as last FROM prices WHERE ticker = ANY($1) GROUP BY ticker',
    [validTickers],
  );
  let maxStart: string | null = hasUnknownTickers ? '2000-01-01' : null;
  let minEnd: string | null = hasUnknownTickers ? toDateStr(new Date()) : null;
  for (const r of rangeRows) {
    const first = toDateStr(r.first);
    const last = toDateStr(r.last);
    if (!maxStart || first > maxStart) maxStart = first;
    if (!minEnd || last < minEnd) minEnd = last;
  }
  return maxStart && minEnd ? { start: maxStart, end: minEnd } : null;
}

async function queryPricesFromDb(
  validTickers: string[],
  startDate: string,
  endDate: string,
  hasUnknownTickers: boolean,
): Promise<{
  result: Record<string, Record<string, number>>;
  missing: string[];
  dbDegraded: boolean;
}> {
  if (!isDbAvailable()) return { result: {}, missing: [...validTickers], dbDegraded: true };
  try {
    let effectiveStart = startDate;
    let effectiveEnd = endDate;
    if (startDate === '' && endDate === '') {
      const range =
        (await computeCommonDateRange(validTickers, hasUnknownTickers)) ??
        (hasUnknownTickers ? { start: '2000-01-01', end: toDateStr(new Date()) } : null);
      if (range) {
        effectiveStart = range.start;
        effectiveEnd = range.end;
      }
    }
    if (validTickers.length === 0 && hasUnknownTickers)
      return { result: {}, missing: [], dbDegraded: false };
    const { rows } = await pgCircuitBreaker.fire(
      'SELECT ticker, date, close FROM prices WHERE ticker = ANY($1) AND date >= $2 AND date <= $3',
      [validTickers, effectiveStart, effectiveEnd],
    );
    const result: Record<string, Record<string, number>> = {};
    for (const { ticker, date, close } of rows as Array<{
      ticker: string;
      date: Date | string;
      close: number;
    }>)
      (result[ticker] ??= {})[toDateStr(date)] = close;
    const missing = validTickers.filter((t) => !result[t] || Object.keys(result[t]).length === 0);
    return { result, missing, dbDegraded: false };
  } catch (err) {
    logger.warn({ err }, '[dataService] fetchHistoryData: PostgreSQL 查询失败');
    return { result: {}, missing: [...validTickers], dbDegraded: true };
  }
}

async function fetchMissingFromGoService(
  stillMissing: string[],
  startDate: string,
  endDate: string,
  cacheKey: string,
  orgId?: string,
): Promise<Record<string, Record<string, number>>> {
  const goResult: Record<string, Record<string, number>> = {};
  try {
    const results = await Promise.all(
      stillMissing.map(
        async (ticker): Promise<{ ticker: string; priceMap: Record<string, number> } | null> => {
          try {
            const response = await callGoDataService(
              `/api/data/price/${ticker}?start=${startDate}&end=${endDate}`,
              orgId,
            );
            const parsed = JSON.parse(response);
            if (parsed.success && Array.isArray(parsed.data)) {
              const priceMap = Object.fromEntries(
                parsed.data.map((p: { date: string; close: number }) => [p.date, p.close]),
              );
              if (Object.keys(priceMap).length > 0) return { ticker, priceMap };
            }
          } catch (tickerErr) {
            logger.warn(
              `[dataService] Go data service failed for ${ticker}: ${(tickerErr as Error).message}`,
            );
          }
          return null;
        },
      ),
    );
    for (const r of results) {
      if (r) {
        goResult[r.ticker] = r.priceMap;
        await setPriceCache(r.ticker, r.priceMap);
      }
    }
    if (Object.keys(goResult).length > 0)
      await writeCache(cacheKey, goResult, HISTORY_CACHE_TTL_SEC);
  } catch (err) {
    logger.warn(`[dataService] Go data service failed: ${(err as Error).message}`);
  }
  return goResult;
}

function validateSearchQuery(query: string, market?: string): boolean {
  if (query.length > 100) {
    logger.warn(`[dataService] searchTickers: query 超过 100 字符限制 (${query.length})`);
    return false;
  }
  if (!/^[\w\s\-.,\u4e00-\u9fff]+$/.test(query)) {
    logger.warn(`[dataService] searchTickers: query 包含非法字符: ${query.slice(0, 50)}`);
    return false;
  }
  if (market) {
    if (market.length > 10) {
      logger.warn(`[dataService] searchTickers: market 超过 10 字符限制 (${market.length})`);
      return false;
    }
    if (!/^[a-zA-Z\u4e00-\u9fff]+$/.test(market)) {
      logger.warn(`[dataService] searchTickers: market 包含非法字符: ${market}`);
      return false;
    }
  }
  return true;
}

async function searchTickersFromDb(
  query: string,
  market?: string,
): Promise<TickerSearchResult[] | null> {
  if (!isDbAvailable()) return null;
  try {
    const tsQueryStr = query
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => w.replace(/'/g, "''"))
      .join(' & ');
    if (tsQueryStr.length === 0) return [];
    let sql =
      'SELECT ticker, category, market FROM tickers WHERE search_vector @@ to_tsquery($1, $2)';
    const params: unknown[] = ['simple', tsQueryStr];
    if (market) {
      sql += ' AND market = $3';
      params.push(market);
    }
    sql += ' LIMIT 20';
    const { rows } = await pgCircuitBreaker.fire(sql, params);
    if (rows.length === 0) return [];
    return rows.map((r: { ticker: string; category: string; market: string }) => ({
      ticker: r.ticker,
      name: r.category,
      market: r.market,
    }));
  } catch (err) {
    logger.warn(
      { err },
      '[dataService] searchTickers: PostgreSQL 全文搜索失败，回退到 Go 数据服务',
    );
    return null;
  }
}

/**
 * 校验标的代码：valid=DB 存在；unknown=格式合法但 DB 不存在（可由 Go 服务实时获取）；invalid=格式非法。
 * DB 不可用时格式合法的标记为 unknown（不抛错，便于调用方降级处理）。
 */
export async function validateTickers(
  tickers: string[],
): Promise<{ valid: string[]; invalid: string[]; unknown: string[] }> {
  const invalid: string[] = [];
  const formatValid: string[] = [];
  for (const ticker of tickers) {
    if (isValidTicker(ticker)) formatValid.push(ticker);
    else invalid.push(ticker);
  }
  if (!isDbAvailable()) return { valid: [], invalid, unknown: formatValid };
  try {
    const { rows } = await pgCircuitBreaker.fire(
      'SELECT ticker FROM tickers WHERE ticker = ANY($1)',
      [formatValid],
    );
    const dbValidSet = new Set(rows.map((r: { ticker: string }) => r.ticker));
    return {
      valid: formatValid.filter((t) => dbValidSet.has(t)),
      invalid,
      unknown: formatValid.filter((t) => !dbValidSet.has(t)),
    };
  } catch (err) {
    logger.warn(
      { err },
      '[dataService] validateTickers: PostgreSQL 查询失败，将格式合法ticker标记为unknown',
    );
    return { valid: [], invalid, unknown: formatValid };
  }
}

export async function searchTickers(
  query: string,
  market?: string,
  orgId?: string,
): Promise<TickerSearchResult[]> {
  if (!validateSearchQuery(query, market)) return [];
  const dbResult = await searchTickersFromDb(query, market);
  if (dbResult !== null) return dbResult;
  const cacheKey = getCacheKey('search', { query, market: market || 'all' });
  const cached = await readCache(cacheKey);
  if (cached) return cached as TickerSearchResult[];
  try {
    const response = await callGoDataService(
      `/api/data/search?q=${encodeURIComponent(query)}`,
      orgId,
    );
    const parsed = JSON.parse(response);
    if (parsed.success && Array.isArray(parsed.data)) {
      const data = parsed.data.map((r: { ticker: string; name: string; market: string }) => ({
        ticker: r.ticker,
        name: r.name,
        market: r.market,
      }));
      await writeCache(cacheKey, data, SEARCH_CACHE_TTL_SEC);
      return data;
    }
    return [];
  } catch (err) {
    logger.warn(
      `Go data service search failed, returning empty results: ${(err as Error).message}`,
    );
    return [];
  }
}

/** 获取引擎状态（PostgreSQL） */
export async function getEngineStatus(): Promise<{
  totalTickers: number;
  cachedTickers: number;
  lastUpdate: string | null;
}> {
  try {
    return await getDbEngineStatus();
  } catch {
    return { totalTickers: 0, cachedTickers: 0, lastUpdate: null };
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

export function scanTickersStats(_force = false): Promise<DbMarketStats | null> {
  return scanMarketStatsFromDb();
}

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

export {
  TickerSearchResult,
  isDbAvailable,
  pgCircuitBreaker,
  callGoDataService,
  queryPricesFromDb,
  fetchMissingFromGoService,
  validateSearchQuery,
  searchTickersFromDb,
};
