import CircuitBreaker from 'opossum';
import type { QueryResultRow } from 'pg';
import { logger } from '../utils/logger.js';
import { toDateStr, DEFAULT_START_DATE } from '../utils/misc.js';
import { getReadPool } from '../db/pool.js';
import { registerCircuitBreakerMetrics } from '../utils/metrics.js';
import { isValidTicker } from '../utils/tickerValidation.js';
import { writeCache, HISTORY_CACHE_TTL_SEC } from './dataCache.js';
import { fetchGoJson } from './goDataServiceClient.js';
import { pricePointArraySchema, summarizeZodIssues } from '../schemas/dataServiceSchemas.js';
import { scanMarketStatsFromDb, getDbEngineStatus, type DbMarketStats } from '../db/marketStats.js';

interface TickerSearchResult {
  ticker: string;
  name: string;
  market: string;
}
export type { TickerSearchResult };

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

export const missingTickers = (
  result: Record<string, Record<string, number>>,
  tickers: string[],
): string[] => tickers.filter((t) => !result[t] || Object.keys(result[t]).length === 0);

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
  /** adjusted_close IS NULL 的行数（未确认复权 → COALESCE 落 close），供上层转 DATA_DEGRADED warning */
  unadjustedCount: number;
}> {
  if (!isDbAvailable())
    return { result: {}, missing: [...validTickers], dbDegraded: true, unadjustedCount: 0 };
  try {
    let [s, e] = [startDate, endDate];
    if (startDate === '' && endDate === '') {
      const range =
        (await computeCommonDateRange(validTickers, hasUnknownTickers)) ??
        (hasUnknownTickers ? { start: DEFAULT_START_DATE, end: toDateStr(new Date()) } : null);
      // 无区间（标的在 DB 无任何数据）：视为缺失而非 DB 降级，避免空区间查询抛错产生假 dbDegraded
      if (!range)
        return { result: {}, missing: validTickers, dbDegraded: false, unadjustedCount: 0 };
      [s, e] = [range.start, range.end];
    }
    if (validTickers.length === 0 && hasUnknownTickers)
      return { result: {}, missing: [], dbDegraded: false, unadjustedCount: 0 };
    const { rows } = await pgCircuitBreaker.fire(
      `SELECT ticker, date, COALESCE(adjusted_close, close) AS close,
              COUNT(*) FILTER (WHERE adjusted_close IS NULL) AS unadjusted_count
       FROM prices WHERE ticker = ANY($1) AND date >= $2 AND date <= $3
       GROUP BY ticker, date`,
      [validTickers, s, e],
    );
    const result: Record<string, Record<string, number>> = {};
    let unadjustedCount = 0;
    const priceRows = rows as Array<{
      ticker: string;
      date: Date | string;
      close: number;
      unadjusted_count?: string | number;
    }>;
    for (const { ticker, date, close, unadjusted_count } of priceRows) {
      (result[ticker] ??= {})[toDateStr(date)] = close;
      if (Number(unadjusted_count) > 0) unadjustedCount += Number(unadjusted_count);
    }
    const missing = missingTickers(result, validTickers);
    return { result, missing, dbDegraded: false, unadjustedCount };
  } catch (err) {
    logger.warn({ err }, '[dataService] fetchHistoryData: PostgreSQL 查询失败');
    return { result: {}, missing: [...validTickers], dbDegraded: true, unadjustedCount: 0 };
  }
}

export async function fetchMissingFromGoService(
  stillMissing: string[],
  startDate: string,
  endDate: string,
  cacheKey: string,
  orgId?: string,
): Promise<{ result: Record<string, Record<string, number>>; degraded: boolean }> {
  const goResult: Record<string, Record<string, number>> = {};
  let degraded = false;
  await Promise.all(
    stillMissing.map(async (ticker) => {
      try {
        const {
          success,
          data,
          degraded: tickerDegraded,
        } = await fetchGoJson(
          `/api/data/price/${encodeURIComponent(ticker)}?start=${startDate}&end=${endDate}`,
          orgId,
        );
        if (!success) return;
        // zod 契约校验（dataServiceSchemas，绑定 store.go PricePoint）：失败 log warn +
        // 走缺失降级语义（不入 goResult → missingTickers → 上层 DATA_DEGRADED 可观测），不炸请求
        const parsed = pricePointArraySchema.safeParse(data);
        if (!parsed.success) {
          logger.warn(
            { ticker, issues: summarizeZodIssues(parsed.error) },
            '[dataService] Go 价格响应契约校验失败，该标的按缺失降级处理',
          );
          return;
        }
        // 清洗脏值：NaN/Inf/非正价格与空日期不入缓存，避免坏数据穿透到引擎（与 Go SanitizePrices 互补）
        const priceMap: Record<string, number> = {};
        for (const p of parsed.data ?? []) {
          if (p.date && Number.isFinite(p.close) && p.close > 0) priceMap[p.date] = p.close;
        }
        if (Object.keys(priceMap).length > 0) {
          goResult[ticker] = priceMap;
        }
        if (tickerDegraded) degraded = true;
      } catch (e) {
        logger.warn(`[dataService] Go data service failed for ${ticker}: ${(e as Error).message}`);
      }
    }),
  );
  const stillMissingAfterGo = missingTickers(goResult, stillMissing);
  // 仅当全部取齐才写缓存，避免局部结果把缺失 ticker 钉在缓存里直到 TTL 过期
  if (stillMissingAfterGo.length === 0) await writeCache(cacheKey, goResult, HISTORY_CACHE_TTL_SEC);
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
