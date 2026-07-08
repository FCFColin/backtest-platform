/**
 * 数据服务模块
 *
 * 数据源：PostgreSQL（唯一运行时源）；缺失数据可走 Go data-fetcher 实时拉取。
 *
 * 企业理由（ADR-007）：PostgreSQL 作为主数据源，支持多实例水平扩展。
 * JSON 文件仅用于 `npm run import:tickers` 一次性导入，运行时不再读取。
 */

import { readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { validateTickerFormat } from '../utils/tickerValidation.js';
import { logger } from '../utils/logger.js';
import { initSchema } from '../db/index.js';
import {
  CACHE_DIR,
  currentCacheVersion,
  getCacheKey,
  readCache,
  writeCache,
  incrementCacheVersion,
  ensureCacheDir,
  deletePriceCache,
  clearPriceCache,
} from './dataCacheService.js';
import {
  TickerSearchResult,
  isDbAvailable,
  pgCircuitBreaker,
  callGoDataService,
  queryPricesFromDb,
  fetchMissingFromGoService,
  validateSearchQuery,
  searchTickersFromDb,
  mockSearchResults,
} from './dataQueryService.js';

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
 */
export interface HistoryDataResult {
  data: Record<string, Record<string, number>>;
  degraded: boolean;
  degradedWarning?: string;
}

/** 全局最近一次 fetchHistoryData 调用的降级状态（非持久，用于同步感知） */
let lastFetchDegraded = false;
let lastFetchDegradedWarning: string | undefined;

/** 读取并清除最近一次数据查询的降级状态 */
export function consumeDegradedFlag(): { degraded: boolean; degradedWarning?: string } {
  const d = { degraded: lastFetchDegraded, degradedWarning: lastFetchDegradedWarning };
  lastFetchDegraded = false;
  lastFetchDegradedWarning = undefined;
  return d;
}

/**
 * 获取历史价格数据，返回包含降级元数据的结果。
 *
 * 与 fetchHistoryData 签名一致，但返回类型包裹降级信息。
 * 推荐新代码使用此函数。
 */
export async function fetchHistoryDataWithDegraded(
  tickers: string[],
  startDate: string,
  endDate: string,
): Promise<HistoryDataResult> {
  const data = await fetchHistoryData(tickers, startDate, endDate);
  const degradedInfo = consumeDegradedFlag();
  return { data, ...degradedInfo };
}

/**
 * 获取多个标的的历史价格数据
 *
 * 优先从 PostgreSQL 查询；缺失标的走 Go data-fetcher 实时拉取，并写入文件缓存。
 * 若数据库或 Go 服务不可用，会标记降级状态（可通过 consumeDegradedFlag 读取）。
 * @param tickers - 标的代码数组（如 ['AAPL', 'MSFT']）
 * @param startDate - 起始日期，格式 YYYY-MM-DD
 * @param endDate - 结束日期，格式 YYYY-MM-DD
 * @returns 按 ticker 分组的价格序列，结构为 { [ticker]: { [date]: price } }；全部非法时返回空对象
 * @throws {Error} 当底层 PostgreSQL/Go 服务调用抛错且未被内部捕获时向上抛出
 */
export async function fetchHistoryData(
  tickers: string[],
  startDate: string,
  endDate: string,
): Promise<Record<string, Record<string, number>>> {
  const fetchStart = Date.now();
  const result: Record<string, Record<string, number>> = {};

  const { valid: validTickers } = validateTickerFormat(tickers);
  if (validTickers.length === 0) {
    logger.warn(
      `[dataService] fetchHistoryData: 全部 ${tickers.length} 个 ticker 非法，返回空结果`,
    );
    return result;
  }

  const {
    result: dbResult,
    missing: missingTickers,
    dbDegraded,
  } = await queryPricesFromDb(validTickers, startDate, endDate);
  Object.assign(result, dbResult);

  if (dbDegraded) {
    lastFetchDegraded = true;
    lastFetchDegradedWarning = '数据库不可用，部分数据可能缺失';
  }

  if (missingTickers.length === 0) {
    logger.info(
      `[dataService] fetchHistoryData: ${validTickers.length} tickers (DB hit), 0 missing, took ${Date.now() - fetchStart}ms`,
    );
    return result;
  }

  const stillMissing = missingTickers.filter(
    (t) => !result[t] || Object.keys(result[t]).length === 0,
  );
  if (stillMissing.length === 0) {
    logger.info(
      `[dataService] fetchHistoryData: ${validTickers.length} tickers (DB hit), took ${Date.now() - fetchStart}ms`,
    );
    return result;
  }

  const cacheKey = getCacheKey('history', {
    tickers: stillMissing.sort().join(','),
    start: startDate,
    end: endDate,
  });

  const cached = await readCache(cacheKey);
  if (cached) {
    Object.assign(result, cached);
    logger.info(
      `[dataService] fetchHistoryData: ${validTickers.length} tickers, ${stillMissing.length} missing (cache hit), took ${Date.now() - fetchStart}ms`,
    );
    return result;
  }

  const goResult = await fetchMissingFromGoService(stillMissing, startDate, endDate, cacheKey);
  Object.assign(result, goResult);

  // Go 数据服务可能无法获取全部缺失 ticker，标记降级
  const stillAfterGo = stillMissing.filter(
    (t) => !result[t] || Object.keys(result[t]).length === 0,
  );
  if (stillAfterGo.length > 0) {
    lastFetchDegraded = true;
    lastFetchDegradedWarning = `Go 数据服务无法获取 ${stillAfterGo.length} 个标的的数据`;
  }

  logger.info(
    `[dataService] fetchHistoryData: ${validTickers.length} tickers, ${stillMissing.length} missing, took ${Date.now() - fetchStart}ms`,
  );
  return result;
}

/**
 * 校验给定标的代码在数据库中是否存在
 *
 * 通过 PostgreSQL 查询 tickers 表区分有效与无效标的。若数据库不可用或查询失败，
 * 返回所有标的为 invalid（不抛错，便于调用方降级处理）。
 * @param tickers - 待校验的标的代码数组
 * @returns { valid: string[]; invalid: string[] } 有效与无效标的列表；DB 不可用时 valid 为空
 */
export async function validateTickers(
  tickers: string[],
): Promise<{ valid: string[]; invalid: string[] }> {
  const valid: string[] = [];
  const invalid: string[] = [];

  if (isDbAvailable()) {
    try {
      const { rows } = await pgCircuitBreaker.fire(
        'SELECT ticker FROM tickers WHERE ticker = ANY($1)',
        [tickers],
      );
      const dbValidSet = new Set(rows.map((r: { ticker: string }) => r.ticker));

      for (const ticker of tickers) {
        if (dbValidSet.has(ticker)) {
          valid.push(ticker);
        } else {
          invalid.push(ticker);
        }
      }
      return { valid, invalid };
    } catch (err) {
      logger.warn({ err }, '[dataService] validateTickers: PostgreSQL 查询失败');
      return { valid: [], invalid: tickers };
    }
  }

  return { valid: [], invalid: tickers };
}

/**
 * 搜索标的代码或名称
 *
 * 优先查 PostgreSQL，未命中查文件缓存，最后调 Go data service 实时搜索。
 * 若 Go 服务失败，回退到 mock 搜索结果（不抛错）。
 * @param query - 搜索关键字（ticker 或名称片段）
 * @param market - 可选市场过滤（如 'US'、'HK'），未指定则查全部
 * @returns 匹配的标的列表；无匹配或查询失败时返回空数组或 mock 结果
 */
export async function searchTickers(query: string, market?: string): Promise<TickerSearchResult[]> {
  if (!validateSearchQuery(query, market)) return [];

  const dbResult = await searchTickersFromDb(query, market);
  if (dbResult !== null) return dbResult;

  const cacheKey = getCacheKey('search', { query, market: market || 'all' });
  const cached = await readCache(cacheKey);
  if (cached) return cached as TickerSearchResult[];

  try {
    const response = await callGoDataService(`/api/data/search?q=${encodeURIComponent(query)}`);
    const parsed = JSON.parse(response);
    if (parsed.success && Array.isArray(parsed.data)) {
      const data = parsed.data.map((r: { ticker: string; name: string; market: string }) => ({
        ticker: r.ticker,
        name: r.name,
        market: r.market,
      }));
      await writeCache(cacheKey, data);
      await incrementCacheVersion();
      return data;
    }
    return [];
  } catch (err) {
    logger.warn(`Go data service search failed, using mock results: ${(err as Error).message}`);
    return mockSearchResults(query);
  }
}

export async function invalidateCache(ticker?: string): Promise<void> {
  if (ticker) {
    await deletePriceCache(ticker);

    ensureCacheDir();
    try {
      const files = await readdir(CACHE_DIR);
      const prefix = ticker.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50);
      for (const file of files) {
        if (file.startsWith(`history_${prefix}=`) || file.includes(`=${prefix}&`)) {
          await unlink(join(CACHE_DIR, file));
        }
      }
    } catch {
      /* ignore */
    }

    logger.info(`[dataService] invalidateCache: ticker=${ticker}`);
  } else {
    await incrementCacheVersion();
    await clearPriceCache();

    logger.info(`[dataService] invalidateCache: 全量失效, new version=${currentCacheVersion}`);
  }
}
