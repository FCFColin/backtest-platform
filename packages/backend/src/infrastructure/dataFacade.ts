/**
 * 数据服务 facade
 *
 * 数据源：PostgreSQL（唯一运行时源）；缺失数据可走 Go data-fetcher 实时拉取。
 *
 * 企业理由（ADR-007）：PostgreSQL 作为主数据源，支持多实例水平扩展。
 * JSON 文件仅用于 `npm run import:tickers` 一次性导入，运行时不再读取。
 *
 * 职责边界（Task 3.2 瘦身）：本文件仅保留 fetchHistoryData 编排逻辑 + initDb。
 * 缓存原语由 dataCache.ts 提供，查询/搜索/校验由 dataQuery.ts 提供，缓存失效
 * 由 dataCache.ts 提供。本文件通过 re-export 直接暴露，避免包装层重复。
 */

import { trace, type Span } from '@opentelemetry/api';
import { logger } from '../utils/logger.js';
import { toDateStr } from '../utils/dateUtils.js';
import { initSchema } from '../db/migrations.js';
import { getCacheKey, readCache } from './dataCache.js';
import { queryPricesFromDb, fetchMissingFromGoService, validateTickers } from './dataQuery.js';

/** OTel tracer（无 SDK 初始化时返回 NoopTracer，不影响测试与运行） */
const tracer = trace.getTracer('backtest-platform', '1.0.0');

/**
 * 初始化 PostgreSQL 数据库 schema
 *
 * 通过 initSchema 创建必要的表结构。若数据库不可用则记录告警日志但不抛错，
 * 行情查询将失败直至数据库恢复。
 * @returns Promise<void>，无返回值
 */
export async function initDb(): Promise<void> {
  try {
    await initSchema();
    logger.info('[dataService] initDb: PostgreSQL schema 初始化完成');
  } catch (err) {
    logger.warn({ err }, '[dataService] initDb: PostgreSQL 不可用，行情查询将失败直至数据库恢复');
  }
}

/**
 * 历史数据查询结果，包含是否从降级路径获取。
 *
 * 企业理由（P1-11）：此前 fetchHistoryData 返回纯数据，Go 服务不可用时
 * 静默返回空数据，调用方无法感知降级。包装返回类型后，调用方可选择
 * 将 degraded 信息传播到 API 响应，让前端和监控系统感知降级。
 *
 * P0 修复：消除全局可变变量 lastFetchDegraded / lastFetchDegradedWarning，
 * 降级信息直接通过返回值传递，避免并发请求间的数据竞争。
 */
interface HistoryDataResult {
  data: Record<string, Record<string, number>>;
  degraded: boolean;
  degradedWarning?: string;
}

/**
 * 获取多个标的的历史价格数据，返回包含降级元数据的结果。
 *
 * 优先从 PostgreSQL 查询；缺失标的走 Go data-fetcher 实时拉取，并写入文件缓存。
 * 若数据库或 Go 服务不可用，返回结果中 degraded=true 并附带 degradedWarning。
 *
 * P0 修复：降级信息通过返回值传递，消除全局可变变量导致的并发数据竞争。
 *
 * @param tickers - 标的代码数组（如 ['AAPL', 'MSFT']）
 * @param startDate - 起始日期，格式 YYYY-MM-DD
 * @param endDate - 结束日期，格式 YYYY-MM-DD
 * @returns 包含 data（价格序列）、degraded（是否降级）、degradedWarning（降级说明）的结果对象
 * @throws {Error} 当底层 PostgreSQL/Go 服务调用抛错且未被内部捕获时向上抛出
 */
export async function fetchHistoryData(
  tickers: string[],
  startDate: string,
  endDate: string,
): Promise<HistoryDataResult> {
  return tracer.startActiveSpan('dataService.fetchHistoryData', async (span) => {
    try {
      span.setAttribute('ticker_count', tickers.length);
      span.setAttribute('start_date', startDate);
      span.setAttribute('end_date', endDate);
      return await fetchHistoryDataImpl(tickers, startDate, endDate, span);
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/** 通过 Go 数据服务补齐缺失标的，返回是否降级 */
async function fetchFromGoWithDegradation(
  tickersToFetch: string[],
  startDate: string,
  endDate: string,
  cacheKey: string,
  result: Record<string, Record<string, number>>,
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
    cacheKey,
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

/** fetchHistoryData 核心实现（提取以控制函数行数） */
async function fetchHistoryDataImpl(
  tickers: string[],
  startDate: string,
  endDate: string,
  span: Span,
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

  if (invalidTickers.length > 0) {
    logger.warn(
      `[dataService] fetchHistoryData: 忽略 ${invalidTickers.length} 个非法 ticker: ${invalidTickers.join(', ')}`,
    );
  }

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
    cacheKey,
    result,
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

// 直接暴露 dataQuery / dataCache 的函数（去除原包装层，削减重复实现）
export { validateTickers, searchTickers } from './dataQuery.js';
export { invalidateTickerCache, invalidateAllCache } from './dataCache.js';
