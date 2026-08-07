// ADR-007: PG 为唯一运行时源，缺失数据走 Go data-fetcher

import { trace, type Span } from '@opentelemetry/api';
import { logger } from '../utils/logger.js';
import { toDateStr } from '../utils/misc.js';
import { initSchema } from '../db/migrations.js';
import { getCacheKey, readCache } from './dataCache.js';
import { queryPricesFromDb, fetchMissingFromGoService, validateTickers } from './dataQuery.js';

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
    effectiveStart = '2000-01-01';
    effectiveEnd = toDateStr(new Date());
  }

  const goResult = await fetchMissingFromGoService(
    tickersToFetch,
    effectiveStart,
    effectiveEnd,
    ctx.cacheKey,
    ctx.orgId,
  );
  Object.assign(result, goResult);

  const stillMissing = tickersToFetch.filter(
    (t) => !result[t] || Object.keys(result[t]).length === 0,
  );
  if (stillMissing.length > 0) {
    return {
      degraded: true,
      degradedWarning: `Go 数据服务无法获取 ${stillMissing.length} 个标的的数据`,
    };
  }
  return { degraded: false };
}

function logInvalidTickers(invalidTickers: string[]): void {
  if (invalidTickers.length === 0) return;
  logger.warn(
    `[dataService] fetchHistoryData: 忽略 ${invalidTickers.length} 个非法 ticker: ${invalidTickers.join(', ')}`,
  );
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

  logInvalidTickers(invalidTickers);

  const totalFetchable = validTickers.length + unknownTickers.length;
  if (totalFetchable === 0) {
    logger.warn(
      `[dataService] fetchHistoryData: 全部 ${tickers.length} 个 ticker 非法，返回空结果`,
    );
    return { data: result, degraded: false };
  }

  const hasUnknownTickers = unknownTickers.length > 0;

  const {
    result: dbResult,
    missing: missingTickers,
    dbDegraded,
  } = await queryPricesFromDb(validTickers, startDate, endDate, hasUnknownTickers);
  Object.assign(result, dbResult);

  if (dbDegraded) {
    degraded = true;
    degradedWarning = '数据库不可用，部分数据可能缺失';
  }

  const tickersToFetch = [...missingTickers, ...unknownTickers];

  if (tickersToFetch.length === 0) {
    span.setAttribute('cache_hit', true);
    span.setAttribute('missing_count', 0);
    logger.info(
      `[dataService] fetchHistoryData: ${validTickers.length} tickers (DB hit), 0 missing, took ${Date.now() - fetchStart}ms`,
    );
    return { data: result, degraded, degradedWarning };
  }

  const cacheKey = getCacheKey('history', {
    tickers: tickersToFetch.sort().join(','),
    start: startDate,
    end: endDate,
  });

  const cached = await readCache(cacheKey);
  if (cached) {
    span.setAttribute('cache_hit', true);
    span.setAttribute('missing_count', tickersToFetch.length);
    Object.assign(result, cached);
    logger.info(
      `[dataService] fetchHistoryData: ${totalFetchable} tickers, ${tickersToFetch.length} missing (cache hit), took ${Date.now() - fetchStart}ms`,
    );
    return { data: result, degraded, degradedWarning };
  }

  span.setAttribute('cache_hit', false);
  span.setAttribute('missing_count', tickersToFetch.length);

  const goDegradation = await fetchFromGoWithDegradation(
    tickersToFetch,
    startDate,
    endDate,
    result,
    { cacheKey, orgId },
  );
  if (goDegradation.degraded) {
    degraded = true;
    degradedWarning = goDegradation.degradedWarning;
  }

  logger.info(
    `[dataService] fetchHistoryData: ${totalFetchable} tickers (${validTickers.length} known, ${unknownTickers.length} unknown), ${tickersToFetch.length} fetched from Go, took ${Date.now() - fetchStart}ms`,
  );
  return { data: result, degraded, degradedWarning };
}

export { validateTickers, searchTickers } from './dataQuery.js';
export { invalidateTickerCache, invalidateAllCache } from './dataCache.js';
