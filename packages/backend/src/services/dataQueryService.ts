import http from 'http';
import CircuitBreaker from 'opossum';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { getReadPool } from '../db/index.js';
import { registerSemaphoreMetrics, registerCircuitBreakerMetrics } from '../utils/metrics.js';
import { writeCache, incrementCacheVersion } from './dataCacheService.js';

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

/** 计算 "全部历史" 模式下所有 ticker 的公共日期区间（交集） */
async function computeCommonDateRange(
  validTickers: string[],
): Promise<{ start: string; end: string } | null> {
  const { rows: rangeRows } = await pgCircuitBreaker.fire(
    'SELECT ticker, MIN(date) as first, MAX(date) as last FROM prices WHERE ticker = ANY($1) GROUP BY ticker',
    [validTickers],
  );
  let maxStart: string | null = null;
  let minEnd: string | null = null;
  for (const r of rangeRows) {
    const first = r.first instanceof Date ? r.first.toISOString().slice(0, 10) : String(r.first);
    const last = r.last instanceof Date ? r.last.toISOString().slice(0, 10) : String(r.last);
    if (!maxStart || first > maxStart) maxStart = first;
    if (!minEnd || last < minEnd) minEnd = last;
  }
  return maxStart && minEnd ? { start: maxStart, end: minEnd } : null;
}

/** 将查询行按 ticker 分组为 price map */
function groupRowsByTicker(
  rows: Array<{ ticker: string; date: Date | string; close: number }>,
): Record<string, Record<string, number>> {
  const grouped: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (!grouped[row.ticker]) grouped[row.ticker] = {};
    const dateStr =
      row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date);
    grouped[row.ticker][dateStr] = row.close;
  }
  return grouped;
}

async function queryPricesFromDb(
  validTickers: string[],
  startDate: string,
  endDate: string,
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

    // "全部历史"：取所有 ticker 的公共日期区间（交集）
    if (startDate === '' && endDate === '') {
      const range = await computeCommonDateRange(validTickers);
      if (range) {
        effectiveStart = range.start;
        effectiveEnd = range.end;
      }
    }

    const sql =
      'SELECT ticker, date, close FROM prices WHERE ticker = ANY($1) AND date >= $2 AND date <= $3 ORDER BY date';
    const { rows } = await pgCircuitBreaker.fire(sql, [validTickers, effectiveStart, effectiveEnd]);

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
      if (r) goResult[r.ticker] = r.priceMap;
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
      return rows.map((r: { ticker: string; category: string; market: string }) => ({
        ticker: r.ticker,
        name: r.category,
        market: r.market,
      }));
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

function mockSearchResults(query: string): TickerSearchResult[] {
  const mockTickers: TickerSearchResult[] = [
    { ticker: '000001.SZ', name: '平安银行', market: 'A股' },
    { ticker: '000002.SZ', name: '万科A', market: 'A股' },
    { ticker: '600000.SH', name: '浦发银行', market: 'A股' },
    { ticker: '600519.SH', name: '贵州茅台', market: 'A股' },
    { ticker: '000858.SZ', name: '五粮液', market: 'A股' },
    { ticker: '601318.SH', name: '中国平安', market: 'A股' },
    { ticker: 'SPY', name: 'S&P 500 ETF', market: '美股' },
    { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', market: '美股' },
    { ticker: 'QQQ', name: 'Invesco QQQ Trust', market: '美股' },
    { ticker: 'BND', name: 'Vanguard Total Bond Market ETF', market: '美股' },
    { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', market: '美股' },
    { ticker: 'AAPL', name: 'Apple Inc.', market: '美股' },
    { ticker: 'MSFT', name: 'Microsoft Corporation', market: '美股' },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', market: '美股' },
    { ticker: 'AMZN', name: 'Amazon.com Inc.', market: '美股' },
  ];

  const q = query.toLowerCase();
  return mockTickers.filter(
    (t) =>
      t.ticker.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.market.toLowerCase().includes(q),
  );
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
  mockSearchResults,
};
