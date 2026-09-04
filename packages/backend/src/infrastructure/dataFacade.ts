// ADR-002: PG 为唯一运行时源，缺失数据走 Go data-fetcher

import { trace, type Span } from '@opentelemetry/api';
import { logger } from '../utils/logger.js';
import { toDateStr, DEFAULT_START_DATE } from '../utils/misc.js';
import { initSchema } from '../db/migrations.js';
import { getCacheKey, readCache, writeCache, SEARCH_CACHE_TTL_SEC } from './dataCache.js';
import {
  queryPricesFromDb,
  fetchMissingFromGoService,
  validateTickers,
  searchTickersFromDb,
  validateSearchQuery,
  missingTickers,
  type TickerSearchResult,
} from './dataQuery.js';
import { fetchGoJson } from './goDataServiceClient.js';

const tracer = trace.getTracer('backtest-platform', '1.0.0');

export async function initDb(): Promise<void> {
  try {
    await initSchema();
    logger.info('[dataService] initDb: PostgreSQL schema 初始化完成');
  } catch (err) {
    logger.warn({ err }, '[dataService] initDb: PostgreSQL 不可用，行情查询将失败直至数据库恢复');
  }
}

// P1-11: 经返回值传播 degraded，消除全局变量并发竞争
interface HistoryDataResult {
  data: Record<string, Record<string, number>>;
  degraded: boolean;
  degradedWarning?: string;
}

export async function fetchHistoryData(
  tickers: string[],
  startDate: string,
  endDate: string,
  orgId?: string,
): Promise<HistoryDataResult> {
  return tracer.startActiveSpan('dataService.fetchHistoryData', async (span) => {
    try {
      span.setAttribute('ticker_count', tickers.length);
      span.setAttribute('start_date', startDate);
      span.setAttribute('end_date', endDate);
      return await fetchHistoryDataImpl(tickers, startDate, endDate, span, orgId);
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

async function fetchFromGoWithDegradation(
  tickersToFetch: string[],
  startDate: string,
  endDate: string,
  result: Record<string, Record<string, number>>,
  ctx: { cacheKey: string; orgId?: string },
): Promise<{ degraded: boolean; degradedWarning?: string }> {
  let effectiveStart = startDate;
  let effectiveEnd = endDate;
  if (startDate === '' && endDate === '') {
    effectiveStart = DEFAULT_START_DATE;
    effectiveEnd = toDateStr(new Date());
  }

  const { result: goResult, degraded: goDegraded } = await fetchMissingFromGoService(
    tickersToFetch,
    effectiveStart,
    effectiveEnd,
    ctx.cacheKey,
    ctx.orgId,
  );
  Object.assign(result, goResult);

  const stillMissing = missingTickers(result, tickersToFetch);
  if (stillMissing.length > 0) {
    return {
      degraded: true,
      degradedWarning: `Go 数据服务无法获取 ${stillMissing.length} 个标的的数据`,
    };
  }
  if (goDegraded) {
    return { degraded: true, degradedWarning: '部分数据来自实时源（降级模式）' };
  }
  return { degraded: false };
}

function applyCachedHistory(
  cached: unknown,
  tickersToFetch: string[],
  result: Record<string, Record<string, number>>,
): string[] | null {
  const cacheResult = cached as Record<string, Record<string, number>>;
  Object.assign(result, cacheResult);
  // 历史脏缓存可能只覆盖局部 ticker：返回仍缺失的集合，调用方对它们落 Go 补取
  const cachedMissing = missingTickers(cacheResult, tickersToFetch);
  return cachedMissing.length === 0 ? null : cachedMissing;
}

/** DB 阶段：查询 + 合流 dbDegraded / unadjusted（R-12/A4 可观测）degraded 语义 */
async function fetchDbStage(ctx: {
  validTickers: string[];
  hasUnknownTickers: boolean;
  startDate: string;
  endDate: string;
  result: Record<string, Record<string, number>>;
}): Promise<{ missingTickers: string[]; degraded: boolean; degradedWarning?: string }> {
  const {
    result: dbResult,
    missing: missingTickers,
    dbDegraded,
    unadjustedCount,
  } = await queryPricesFromDb(ctx.validTickers, ctx.startDate, ctx.endDate, ctx.hasUnknownTickers);
  Object.assign(ctx.result, dbResult);
  if (dbDegraded) {
    return { missingTickers, degraded: true, degradedWarning: '数据库不可用，部分数据可能缺失' };
  }
  // R-12/A4 可观测：DB 内存在未确认复权的行（COALESCE 落 close）→ 转 DATA_DEGRADED warning，
  // 经既有 degraded 通道透传（backtest-helpers: preparePriceDataAndWarnings → warnings 推送）
  if (unadjustedCount > 0) {
    return {
      missingTickers,
      degraded: true,
      degradedWarning: `${unadjustedCount} 行价格未确认复权（adjusted_close 缺失，按未复权 close 计算）`,
    };
  }
  return { missingTickers, degraded: false };
}

/** 缓存阶段：读历史缓存补齐缺失 ticker；全部命中返回 null，部分命中返回仍需 Go 补取的集合 */
async function applyHistoryCache(
  tickersToFetch: string[],
  startDate: string,
  endDate: string,
  result: Record<string, Record<string, number>>,
): Promise<{ cachedMissing: string[] | null; cacheKey: string }> {
  const cacheKey = getCacheKey('history', {
    tickers: tickersToFetch.sort().join(','),
    start: startDate,
    end: endDate,
  });
  const cached = await readCache(cacheKey);
  if (!cached) return { cachedMissing: tickersToFetch, cacheKey };
  return { cachedMissing: applyCachedHistory(cached, tickersToFetch, result), cacheKey };
}

/** Go 补取阶段降级合流：degradedWarning 以 '；' 连接（保持既有合流语义） */
function mergeGoDegradation(
  cur: { degraded: boolean; degradedWarning?: string },
  go: { degraded: boolean; degradedWarning?: string },
): { degraded: boolean; degradedWarning?: string } {
  if (!go.degraded) return cur;
  return {
    degraded: true,
    degradedWarning: [cur.degradedWarning, go.degradedWarning].filter(Boolean).join('；'),
  };
}

async function fetchHistoryDataImpl(
  tickers: string[],
  startDate: string,
  endDate: string,
  span: Span,
  orgId?: string,
): Promise<HistoryDataResult> {
  const fetchStart = Date.now();
  const result: Record<string, Record<string, number>> = {};
  let degraded = false;
  let degradedWarning: string | undefined;

  const {
    valid: validTickers,
    invalid: invalidTickers,
    unknown: unknownTickers,
  } = await validateTickers(tickers);
  span.setAttribute('valid_ticker_count', validTickers.length);
  span.setAttribute('unknown_ticker_count', unknownTickers.length);

  if (invalidTickers.length > 0)
    logger.warn(
      `[dataService] 忽略 ${invalidTickers.length} 个非法 ticker: ${invalidTickers.join(', ')}`,
    );

  const totalFetchable = validTickers.length + unknownTickers.length;
  if (totalFetchable === 0) {
    logger.warn(`[dataService] 全部 ${tickers.length} 个 ticker 非法，返回空结果`);
    return { data: result, degraded: false };
  }

  const hasUnknownTickers = unknownTickers.length > 0;

  const dbStage = await fetchDbStage({
    validTickers,
    hasUnknownTickers,
    startDate,
    endDate,
    result,
  });
  ({ degraded, degradedWarning } = dbStage);
  let tickersToFetch = [...dbStage.missingTickers, ...unknownTickers];

  if (tickersToFetch.length === 0) {
    span.setAttribute('cache_hit', true);
    span.setAttribute('missing_count', 0);
    logger.info(
      `[dataService] fetchHistoryData: ${validTickers.length} tickers (DB hit), 0 missing, took ${Date.now() - fetchStart}ms`,
    );
    return { data: result, degraded, degradedWarning };
  }

  const { cachedMissing, cacheKey } = await applyHistoryCache(
    tickersToFetch,
    startDate,
    endDate,
    result,
  );
  if (cachedMissing === null) {
    span.setAttribute('cache_hit', true);
    span.setAttribute('missing_count', 0);
    logger.info(
      `[dataService] fetchHistoryData: ${totalFetchable} tickers, ${tickersToFetch.length} missing (cache hit), took ${Date.now() - fetchStart}ms`,
    );
    return { data: result, degraded, degradedWarning };
  }
  span.setAttribute('cache_hit', false);
  tickersToFetch = cachedMissing;
  span.setAttribute('missing_count', tickersToFetch.length);

  const goDegradation = await fetchFromGoWithDegradation(
    tickersToFetch,
    startDate,
    endDate,
    result,
    { cacheKey, orgId },
  );
  ({ degraded, degradedWarning } = mergeGoDegradation(
    { degraded, degradedWarning },
    goDegradation,
  ));

  logger.info(
    `[dataService] fetchHistoryData: ${totalFetchable} tickers (${validTickers.length} known, ${unknownTickers.length} unknown), ${tickersToFetch.length} fetched from Go, took ${Date.now() - fetchStart}ms`,
  );
  return { data: result, degraded, degradedWarning };
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

export { validateTickers } from './dataQuery.js';
export { invalidateAllCache } from './dataCache.js';
