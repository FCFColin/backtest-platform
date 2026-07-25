/**
 * 市场数据查询模块（价格 / Ticker 搜索）。
 *
 * RLS 说明（P0-03 审计结论）：本模块查询的 prices / tickers 表为全局共享市场数据，
 * 不含 tenant_id 列，不启用 RLS。所有租户共享同一份行情数据，无需租户隔离。
 * 直连 getReadPool() 是正确设计——不适用 withTenantReadOnly()。
 *
 * P0-03：HTTP 响应体大小限制——Go 数据服务返回的行情数据可能很大（全量历史价格），
 * 无限制地累加响应体会导致内存溢出（OOM）。通过 MAX_RESPONSE_BODY_SIZE 环境变量
 * 配置上限（默认 50MB），超限时销毁请求并拒绝。
 */
import http from 'http';
import CircuitBreaker from 'opossum';

/** HTTP 响应体最大字节数（默认 50MB），可通过 MAX_RESPONSE_BODY_SIZE 环境变量配置。 */
const MAX_RESPONSE_BODY_SIZE = parseInt(
  process.env.MAX_RESPONSE_BODY_SIZE || String(50 * 1024 * 1024),
  10,
);
import { logger } from '../utils/logger.js';
import { toDateStr } from '../utils/dateUtils.js';
import { config } from '../config/index.js';
import { getReadPool } from '../db/pool.js';
import { registerSemaphoreMetrics, registerCircuitBreakerMetrics } from '../utils/metrics.js';
import { isValidTicker } from '../utils/tickerValidation.js';
import {
  writeCache,
  setPriceCache,
  getCacheKey,
  readCache,
  HISTORY_CACHE_TTL_SEC,
  SEARCH_CACHE_TTL_SEC,
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
    const baseUrl = config.GO_DATA_SERVICE_URL || 'http://127.0.0.1:15003';
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
          // P0-03：Content-Length 预检——如果响应头声明的大小已超限，直接拒绝不等数据到达
          const contentLength = parseInt(res.headers['content-length'] || '', 10);
          if (!Number.isNaN(contentLength) && contentLength > MAX_RESPONSE_BODY_SIZE) {
            res.destroy();
            reject(
              new Error(
                `Go data service response too large: Content-Length ${contentLength} exceeds limit ${MAX_RESPONSE_BODY_SIZE}`,
              ),
            );
            return;
          }

          let body = '';
          let receivedBytes = 0;
          res.on('data', (chunk: Buffer) => {
            // P0-03：累加已接收字节数，超限则销毁响应流并拒绝
            receivedBytes += chunk.length;
            if (receivedBytes > MAX_RESPONSE_BODY_SIZE) {
              res.destroy();
              reject(
                new Error(
                  `Go data service response too large: received ${receivedBytes} bytes exceeds limit ${MAX_RESPONSE_BODY_SIZE}`,
                ),
              );
              return;
            }
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
      await writeCache(cacheKey, goResult, HISTORY_CACHE_TTL_SEC);
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

/**
 * 从 prices_monthly CAGG 查询月线收盘价（P1-01 T7）。
 *
 * TimescaleDB Continuous Aggregate 预计算月线 OHLCV，查询走物化视图
 * 而非原始 prices hypertable，利用 chunk 级分区裁剪获得 10-100x 性能提升。
 * 适用于月度统计、年化收益计算等无需日度精度的场景。
 *
 * @param validTickers - 已验证的 ticker 列表
 * @param startDate - 起始月份（YYYY-MM-DD，自动截断到月初）
 * @param endDate - 结束月份（YYYY-MM-DD，自动截断到月初）
 * @returns 月线收盘价 map：{ ticker: { 'YYYY-MM-01': close } }
 */
export async function queryMonthlyPricesFromDb(
  validTickers: string[],
  startDate: string,
  endDate: string,
): Promise<Record<string, Record<string, number>>> {
  if (!isDbAvailable() || validTickers.length === 0) {
    return {};
  }

  try {
    // 查询 prices_monthly CAGG，month 列为 date_trunc('month', date) 的结果
    const sql =
      'SELECT ticker, month, close FROM prices_monthly WHERE ticker = ANY($1) AND month >= $2 AND month <= $3 ORDER BY month';
    const { rows } = await pgCircuitBreaker.fire(sql, [
      validTickers,
      startDate,
      endDate,
    ]);

    const grouped: Record<string, Record<string, number>> = {};
    for (const row of rows as Array<{ ticker: string; month: Date | string; close: number }>) {
      if (!grouped[row.ticker]) grouped[row.ticker] = {};
      grouped[row.ticker][toDateStr(row.month)] = row.close;
    }
    return grouped;
  } catch (err) {
    logger.warn(
      `[dataQuery] prices_monthly CAGG query failed, falling back to daily query: ${(err as Error).message}`,
    );
    // CAGG 不可用时降级为日度查询取月末值
    const dailyResult = await queryPricesFromDb(validTickers, startDate, endDate, false);
    const monthlyResult: Record<string, Record<string, number>> = {};
    for (const [ticker, dailyPrices] of Object.entries(dailyResult.result)) {
      const monthMap: Record<string, number> = {};
      const sortedDates = Object.keys(dailyPrices).sort();
      for (const dateStr of sortedDates) {
        const monthKey = dateStr.substring(0, 7) + '-01';
        monthMap[monthKey] = dailyPrices[dateStr];
      }
      monthlyResult[ticker] = monthMap;
    }
    return monthlyResult;
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
