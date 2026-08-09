import CircuitBreaker from 'opossum';
import type { QueryResultRow } from 'pg';
import { logger } from '../utils/logger.js';
import { toDateStr } from '../utils/misc.js';
import { getReadPool } from '../db/pool.js';
import { registerCircuitBreakerMetrics } from '../utils/metrics.js';
import { isValidTicker } from '../utils/tickerValidation.js';
import {
  writeCache,
  getCacheKey,
  readCache,
  HISTORY_CACHE_TTL_SEC,
  SEARCH_CACHE_TTL_SEC,
} from './dataCache.js';
import { fetchGoJson } from './goDataServiceClient.js';
import { scanMarketStatsFromDb, getDbEngineStatus, type DbMarketStats } from '../db/marketStats.js';

const DEFAULT_START_DATE = '2000-01-01';
function defaultDateRange(): [string, string] {
  return [DEFAULT_START_DATE, toDateStr(new Date())];
}

interface TickerSearchResult {
  ticker: string;
  name: string;
  market: string;
}

export const pgCircuitBreaker = new CircuitBreaker(
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
const CB_EVENTS = {
  open: ['warn', '后续查询将失败直至恢复'],
  halfOpen: ['info', '放行探测查询'],
  close: ['info', 'PostgreSQL 恢复正常'],
} as const;
for (const [event, [level, msg]] of Object.entries(CB_EVENTS))
  (pgCircuitBreaker.on as (event: string, listener: () => void) => typeof pgCircuitBreaker)(
    event,
    () => logger[level](`[dataService] PostgreSQL 熔断器 ${event.toUpperCase()}：${msg}`),
  );
registerCircuitBreakerMetrics('postgres', pgCircuitBreaker);

export function isDbAvailable(): boolean {
  return !pgCircuitBreaker.opened;
}

async function runQuery<T extends QueryResultRow>(
  sql: string,
  params: unknown[],
  tag: string,
  useCb = false,
): Promise<T[] | null> {
  if (useCb && !isDbAvailable()) return null;
  try {
    const res = useCb
      ? await pgCircuitBreaker.fire(sql, params)
      : await getReadPool().query<T>(sql, params);
    return res.rows as T[];
  } catch (err) {
    logger.warn({ err: err as Error }, `[dataService] ${tag}: PostgreSQL 查询失败`);
    return null;
  }
}

async function computeCommonDateRange(
  validTickers: string[],
  hasUnknownTickers: boolean,
): Promise<{ start: string; end: string } | null> {
  const { rows } = await pgCircuitBreaker.fire(
    'SELECT ticker, MIN(date) as first, MAX(date) as last FROM prices WHERE ticker = ANY($1) GROUP BY ticker',
    [validTickers],
  );
  let maxStart: string | null = hasUnknownTickers ? DEFAULT_START_DATE : null;
  let minEnd: string | null = hasUnknownTickers ? toDateStr(new Date()) : null;
  for (const r of rows) {
    const first = toDateStr(r.first),
      last = toDateStr(r.last);
    if (!maxStart || first > maxStart) maxStart = first;
    if (!minEnd || last < minEnd) minEnd = last;
  }
  return maxStart && minEnd ? { start: maxStart, end: minEnd } : null;
}

export async function queryPricesFromDb(
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
    let [s, e] = [startDate, endDate];
    if (startDate === '' && endDate === '') {
      const range =
        (await computeCommonDateRange(validTickers, hasUnknownTickers)) ??
        (hasUnknownTickers ? { start: DEFAULT_START_DATE, end: toDateStr(new Date()) } : null);
      if (range) [s, e] = [range.start, range.end];
    }
    if (validTickers.length === 0 && hasUnknownTickers)
      return { result: {}, missing: [], dbDegraded: false };
    const { rows } = await pgCircuitBreaker.fire(
      'SELECT ticker, date, close FROM prices WHERE ticker = ANY($1) AND date >= $2 AND date <= $3',
      [validTickers, s, e],
    );
    const result: Record<string, Record<string, number>> = {};
    const priceRows = rows as Array<{ ticker: string; date: Date | string; close: number }>;
    for (const { ticker, date, close } of priceRows)
      (result[ticker] ??= {})[toDateStr(date)] = close;
    const missing = validTickers.filter((t) => !result[t] || Object.keys(result[t]).length === 0);
    return { result, missing, dbDegraded: false };
  } catch (err) {
    logger.warn({ err }, '[dataService] fetchHistoryData: PostgreSQL 查询失败');
    return { result: {}, missing: [...validTickers], dbDegraded: true };
  }
}

export async function fetchMissingFromGoService(
  stillMissing: string[],
  startDate: string,
  endDate: string,
  cacheKey: string,
  orgId?: string,
): Promise<{ result: Record<string, Record<string, number>>; degraded: boolean }> {
  let [s, e] = [startDate, endDate];
  if (s === '' && e === '') [s, e] = defaultDateRange();
  const goResult: Record<string, Record<string, number>> = {};
  let degraded = false;
  await Promise.all(
    stillMissing.map(async (ticker) => {
      try {
        const {
          success,
          data,
          degraded: tickerDegraded,
        } = await fetchGoJson(`/api/data/price/${ticker}?start=${s}&end=${e}`, orgId);
        if (success && Array.isArray(data)) {
          const priceMap = Object.fromEntries(
            (data as Array<{ date: string; close: number }>).map((p) => [p.date, p.close]),
          );
          if (Object.keys(priceMap).length > 0) {
            goResult[ticker] = priceMap;
          }
          if (tickerDegraded) degraded = true;
        }
      } catch (e) {
        logger.warn(`[dataService] Go data service failed for ${ticker}: ${(e as Error).message}`);
      }
    }),
  );
  if (Object.keys(goResult).length > 0) await writeCache(cacheKey, goResult, HISTORY_CACHE_TTL_SEC);
  return { result: goResult, degraded };
}

export function validateSearchQuery(query: string, market?: string): boolean {
  const qBad = query.length > 100 || !/^[\w\s\-.,\u4e00-\u9fff]+$/.test(query);
  const mBad = !!market && (market.length > 10 || !/^[a-zA-Z\u4e00-\u9fff]+$/.test(market));
  if (qBad || mBad)
    logger.warn(`[dataService] searchTickers: ${qBad ? 'query' : 'market'} 校验失败`);
  return !qBad && !mBad;
}

export async function searchTickersFromDb(
  query: string,
  market?: string,
): Promise<TickerSearchResult[] | null> {
  const tsQueryStr = query
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/'/g, "''"))
    .join(' & ');
  if (!tsQueryStr) return [];
  let sql =
    'SELECT ticker, category, market FROM tickers WHERE search_vector @@ to_tsquery($1, $2)';
  const params: unknown[] = ['simple', tsQueryStr];
  if (market) {
    sql += ' AND market = $3';
    params.push(market);
  }
  sql += ' ORDER BY ts_rank(search_vector, to_tsquery($1, $2)) DESC LIMIT 20';
  const rows = await runQuery<{ ticker: string; category: string; market: string }>(
    sql,
    params,
    'searchTickers',
    true,
  );
  return rows === null
    ? null
    : rows.map((r) => ({ ticker: r.ticker, name: r.category, market: r.market }));
}

export async function validateTickers(
  tickers: string[],
): Promise<{ valid: string[]; invalid: string[]; unknown: string[] }> {
  const invalid = tickers.filter((t) => !isValidTicker(t));
  const formatValid = tickers.filter(isValidTicker);
  if (!isDbAvailable()) return { valid: [], invalid, unknown: formatValid };
  const rows = await runQuery<{ ticker: string }>(
    'SELECT ticker FROM tickers WHERE ticker = ANY($1)',
    [formatValid],
    'validateTickers',
    true,
  );
  if (rows === null) return { valid: [], invalid, unknown: formatValid };
  const dbSet = new Set(rows.map((r) => r.ticker));
  return {
    valid: formatValid.filter((t) => dbSet.has(t)),
    invalid,
    unknown: formatValid.filter((t) => !dbSet.has(t)),
  };
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
    const { success, data } = await fetchGoJson(
      `/api/data/search?q=${encodeURIComponent(query)}`,
      orgId,
    );
    if (success && Array.isArray(data)) {
      const mapped = data.map((r: { ticker: string; name: string; market: string }) => ({
        ticker: r.ticker,
        name: r.name,
        market: r.market,
      }));
      await writeCache(cacheKey, mapped, SEARCH_CACHE_TTL_SEC);
      return mapped;
    }
    return [];
  } catch (err) {
    logger.warn(
      `Go data service search failed, returning empty results: ${(err as Error).message}`,
    );
    return [];
  }
}

export async function getEngineStatus() {
  try {
    return await getDbEngineStatus();
  } catch {
    return { totalTickers: 0, cachedTickers: 0, lastUpdate: null };
  }
}

export async function getTickerList() {
  const rows = await runQuery<{ ticker: string; category: string; market: string }>(
    'SELECT ticker, category, market FROM tickers ORDER BY ticker LIMIT 500',
    [],
    'getTickerList',
  );
  return (rows ?? []).map((r) => ({
    ticker: r.ticker,
    name: r.category || r.ticker,
    category: r.category || '',
    market: r.market || '',
  }));
}

export async function loadTickerData(ticker: string): Promise<Record<string, unknown> | null> {
  if (!isValidTicker(ticker)) {
    logger.warn(`[tickerDataService] loadTickerData: 拒绝非法 ticker: ${ticker}`);
    return null;
  }
  const rows = await runQuery<{
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    adjusted_close: number | null;
  }>(
    'SELECT date, open, high, low, close, volume, adjusted_close FROM prices WHERE ticker = $1 ORDER BY date',
    [ticker],
    'loadTickerData',
  );
  if (!rows || rows.length === 0) return null;
  return {
    meta: { ticker },
    prices: rows.map(({ date, open, high, low, close, volume, adjusted_close }) => ({
      date: toDateStr(date),
      open,
      high,
      low,
      close,
      volume,
      adj_close: adjusted_close ?? close,
    })),
  };
}

export const scanTickersStats = (): Promise<DbMarketStats | null> => scanMarketStatsFromDb();

export function resolveUniverseFromCacheStats(stats: DbMarketStats | null) {
  if (!stats || stats.total_cached <= 0) return { total: 0, updated_at: '', stats: {} };
  const { by_market = {}, by_type = {} } = stats;
  return {
    total: stats.total_cached,
    updated_at: stats.generated_at,
    stats: {
      total: stats.total_cached,
      stocks: by_type.STOCK ?? 0,
      etfs: by_type.ETF ?? 0,
      indices: Object.values(by_market).reduce((s, m) => s + (m.indices ?? 0), 0),
      us: by_market.US?.count ?? 0,
      cn: by_market.CN?.count ?? 0,
    },
  };
}

export const getUniverseStats = async () =>
  resolveUniverseFromCacheStats(await scanMarketStatsFromDb());
