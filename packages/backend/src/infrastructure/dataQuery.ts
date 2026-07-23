import http from 'http';
import CircuitBreaker from 'opossum';
import { logger } from '../utils/logger.js';
import { toDateStr } from '../utils/dateUtils.js';
import { config } from '../config/index.js';
import { getReadPool } from '../db/pool.js';
import { registerSemaphoreMetrics, registerCircuitBreakerMetrics } from '../utils/metrics.js';
import { isValidTicker } from '../utils/tickerValidation.js';
import {
  writeCache,
  incrementCacheVersion,
  setPriceCache,
  getCacheKey,
  readCache,
} from './dataCache.js';

interface TickerSearchResult {
  ticker: string;
  name: string;
  market: string;
}

const pgCircuitBreaker = new CircuitBreaker(
  async (queryText: string, params?: unknown[]) => {
    const pool = getReadPool();
    return pool.query(queryText, params);
  },
  {
    name: 'postgres',
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 10000,
    rollingCountTimeout: 60000,
    rollingCountBuckets: 6,
  },
);

pgCircuitBreaker.on('open', () => {
  logger.warn('[dataService] PostgreSQL 熔断器 OPEN：后续查询将失败直至恢复');
});
pgCircuitBreaker.on('halfOpen', () => {
  logger.info('[dataService] PostgreSQL 熔断器 HALF-OPEN：放行探测查询');
});
pgCircuitBreaker.on('close', () => {
  logger.info('[dataService] PostgreSQL 熔断器 CLOSED：PostgreSQL 恢复正常');
});

registerCircuitBreakerMetrics('postgres', pgCircuitBreaker);

function isDbAvailable(): boolean {
  return !pgCircuitBreaker.opened;
}

class Semaphore {
  private permits: number;
  private readonly maxPermits: number;
  private waitQueue: Array<() => void> = [];

  constructor(maxConcurrency: number) {
    this.permits = maxConcurrency;
    this.maxPermits = maxConcurrency;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }

  available(): number {
    return this.permits;
  }

  total(): number {
    return this.maxPermits;
  }
}

const goServiceSemaphore = new Semaphore(10);

registerSemaphoreMetrics('go_data_service', goServiceSemaphore.total(), () =>
  goServiceSemaphore.available(),
);

async function callGoDataService(path: string): Promise<string> {
  await goServiceSemaphore.acquire();
  try {
    const baseUrl = config.GO_DATA_SERVICE_URL || 'http://127.0.0.1:5003';
    const url = `${baseUrl}${path}`;

    return await new Promise<string>((resolve, reject) => {
      const req = http.request(
        url,
        {
          method: 'GET',
          timeout: config.GO_DATA_SERVICE_TIMEOUT_MS,
          headers: {
            'X-Data-Service-Auth': config.DATA_SERVICE_AUTH_TOKEN,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(body);
            } else {
              reject(
                new Error(`Go data service returned HTTP ${res.statusCode}: ${body.slice(0, 200)}`),
              );
            }
          });
        },
      );

      req.on('error', (err: Error) => {
        reject(new Error(`Go data service request failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Go data service request timed out after 30 seconds'));
      });

      req.end();
    });
  } finally {
    goServiceSemaphore.release();
  }
}

/** 从 DB 行中计算日期交集 */
function computeIntersection(
  rangeRows: Array<{ first: Date | string; last: Date | string }>,
  defaultStart: string | null,
  defaultEnd: string | null,
): { start: string; end: string } | null {
  let maxStart = defaultStart;
  let minEnd = defaultEnd;
  for (const r of rangeRows) {
    const first = toDateStr(r.first);
    const last = toDateStr(r.last);
    if (!maxStart || first > maxStart) maxStart = first;
    if (!minEnd || last < minEnd) minEnd = last;
  }
  return maxStart && minEnd ? { start: maxStart, end: minEnd } : null;
}

/** 计算 "全部历史" 模式下所有 ticker 的公共日期区间（交集） */
async function computeCommonDateRange(
  validTickers: string[],
  hasUnknownTickers: boolean,
): Promise<{ start: string; end: string } | null> {
  const { rows: rangeRows } = await pgCircuitBreaker.fire(
    'SELECT ticker, MIN(date) as first, MAX(date) as last FROM prices WHERE ticker = ANY($1) GROUP BY ticker',
    [validTickers],
  );

  if (hasUnknownTickers) {
    return computeIntersection(rangeRows, '2000-01-01', toDateStr(new Date()));
  }

  return computeIntersection(rangeRows, null, null);
}

/** 将查询行按 ticker 分组为 price map */
function groupRowsByTicker(
  rows: Array<{ ticker: string; date: Date | string; close: number }>,
): Record<string, Record<string, number>> {
  const grouped: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (!grouped[row.ticker]) grouped[row.ticker] = {};
    const dateStr = toDateStr(row.date);
    grouped[row.ticker][dateStr] = row.close;
  }
  return grouped;
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
  const result: Record<string, Record<string, number>> = {};
  const missing: string[] = [];

  if (!isDbAvailable()) {
    return { result, missing: [...validTickers], dbDegraded: true };
  }

  try {
    let effectiveStart = startDate;
    let effectiveEnd = endDate;

    if (startDate === '' && endDate === '') {
      const range = await computeCommonDateRange(validTickers, hasUnknownTickers);
      if (range) {
        effectiveStart = range.start;
        effectiveEnd = range.end;
      } else if (hasUnknownTickers) {
        effectiveStart = '2000-01-01';
        effectiveEnd = toDateStr(new Date());
      }
    }

    const tickersToQuery = validTickers;
    if (tickersToQuery.length === 0 && hasUnknownTickers) {
      return { result, missing: [], dbDegraded: false };
    }

    const sql =
      'SELECT ticker, date, close FROM prices WHERE ticker = ANY($1) AND date >= $2 AND date <= $3 ORDER BY date';
    const { rows } = await pgCircuitBreaker.fire(sql, [
      tickersToQuery,
      effectiveStart,
      effectiveEnd,
    ]);

    const grouped = groupRowsByTicker(rows);

    for (const ticker of validTickers) {
      if (grouped[ticker] && Object.keys(grouped[ticker]).length > 0) {
        result[ticker] = grouped[ticker];
      } else {
        missing.push(ticker);
      }
    }
  } catch (err) {
    logger.warn({ err }, '[dataService] fetchHistoryData: PostgreSQL 查询失败');
    return { result, missing: [...validTickers], dbDegraded: true };
  }

  return { result, missing, dbDegraded: false };
}

async function fetchMissingFromGoService(
  stillMissing: string[],
  startDate: string,
  endDate: string,
  cacheKey: string,
): Promise<Record<string, Record<string, number>>> {
  const goResult: Record<string, Record<string, number>> = {};

  try {
    const goPromises = stillMissing.map(async (ticker) => {
      try {
        const response = await callGoDataService(
          `/api/data/price/${ticker}?start=${startDate}&end=${endDate}`,
        );
        const parsed = JSON.parse(response);
        if (parsed.success && Array.isArray(parsed.data)) {
          const priceMap: Record<string, number> = {};
          for (const p of parsed.data) {
            priceMap[p.date] = p.close;
          }
          if (Object.keys(priceMap).length > 0) {
            return { ticker, priceMap };
          }
        }
      } catch (tickerErr) {
        logger.warn(
          `[dataService] Go data service failed for ${ticker}: ${(tickerErr as Error).message}`,
        );
      }
      return null;
    });

    const goResults = await Promise.all(goPromises);
    for (const r of goResults) {
      if (r) {
        goResult[r.ticker] = r.priceMap;
        await setPriceCache(r.ticker, r.priceMap);
      }
    }

    if (Object.keys(goResult).length > 0) {
      await writeCache(cacheKey, goResult);
      await incrementCacheVersion();
    }
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
    if (rows.length > 0) {
      // JS 侧兜底上限：SQL LIMIT 20 已限制生产结果，此处 30 为防御性上限（mock/降级场景绕过 SQL 时仍保证上限）
      return rows
        .map((r: { ticker: string; category: string; market: string }) => ({
          ticker: r.ticker,
          name: r.category,
          market: r.market,
        }))
        .slice(0, 30);
    }
    return [];
  } catch (err) {
    logger.warn(
      { err },
      '[dataService] searchTickers: PostgreSQL 全文搜索失败，回退到 Go 数据服务',
    );
    return null;
  }
}

/**
 * 校验给定标的代码
 *
 * 通过 PostgreSQL 查询 tickers 表区分三类标的：
 * - valid: DB 中存在的标的
 * - unknown: 格式合法但 DB 中不存在的标的（仍可通过 Go 服务实时获取）
 * - invalid: 格式非法的标的
 *
 * 若数据库不可用或查询失败，格式合法的标的标记为 unknown（不抛错，便于调用方降级处理）。
 * @param tickers - 待校验的标的代码数组
 * @returns { valid: string[]; invalid: string[]; unknown: string[] }
 */
export async function validateTickers(
  tickers: string[],
): Promise<{ valid: string[]; invalid: string[]; unknown: string[] }> {
  const valid: string[] = [];
  const invalid: string[] = [];
  const unknown: string[] = [];

  const formatValid: string[] = [];
  for (const ticker of tickers) {
    if (isValidTicker(ticker)) {
      formatValid.push(ticker);
    } else {
      invalid.push(ticker);
    }
  }

  if (isDbAvailable()) {
    try {
      const { rows } = await pgCircuitBreaker.fire(
        'SELECT ticker FROM tickers WHERE ticker = ANY($1)',
        [formatValid],
      );
      const dbValidSet = new Set(rows.map((r: { ticker: string }) => r.ticker));

      for (const ticker of formatValid) {
        if (dbValidSet.has(ticker)) {
          valid.push(ticker);
        } else {
          unknown.push(ticker);
        }
      }
      return { valid, invalid, unknown };
    } catch (err) {
      logger.warn(
        { err },
        '[dataService] validateTickers: PostgreSQL 查询失败，将格式合法ticker标记为unknown',
      );
      return { valid: [], invalid, unknown: formatValid };
    }
  }

  return { valid: [], invalid, unknown: formatValid };
}

/**
 * 搜索标的代码或名称
 *
 * 优先查 PostgreSQL，未命中查文件缓存，最后调 Go data service 实时搜索。
 * 若 Go 服务失败，返回空数组（不抛错）。
 * @param query - 搜索关键字（ticker 或名称片段）
 * @param market - 可选市场过滤（如 'US'、'HK'），未指定则查全部
 * @returns 匹配的标的列表；无匹配或查询失败时返回空数组
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
    logger.warn(
      `Go data service search failed, returning empty results: ${(err as Error).message}`,
    );
    return [];
  }
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
