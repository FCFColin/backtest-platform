/**
 * 数据服务模块
 *
 * 数据源：PostgreSQL（唯一运行时源）；缺失数据可走 Go data-fetcher 实时拉取。
 *
 * 企业理由（ADR-007）：PostgreSQL 作为主数据源，支持多实例水平扩展。
 * JSON 文件仅用于 `npm run import:tickers` 一次性导入，运行时不再读取。
 */

import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import CircuitBreaker from 'opossum';
import { validateTickerFormat } from '../utils/tickerValidation.js';
import { signFileSync, verifyFileSync } from '../utils/integrity.js';
import { logger } from '../utils/logger.js';
import { registerSemaphoreMetrics, registerCircuitBreakerMetrics } from '../utils/metrics.js';
import { getReadPool, initSchema } from '../db/index.js';
import { config } from '../config/index.js';
import { appRedis } from '../config/redis.js';
interface TickerSearchResult {
  ticker: string;
  name: string;
  market: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.resolve(__dirname, '../../data/cache');

/**
 * 缓存版本号机制
 *
 * 企业理由：多实例部署时，实例 A 更新数据后实例 B 仍返回旧缓存，
 * 导致用户看到不一致的数据。版本号机制确保缓存失效可被检测。
 * 权衡：每次缓存命中需额外读取版本号文件（微量 I/O），
 * 但比 Redis 等外部缓存方案简单得多，适合当前单机/少实例场景。
 */
const CACHE_VERSION_FILE = path.join(CACHE_DIR, '.cache_version');
let currentCacheVersion = 0;

/** 读取缓存版本号 */
function readCacheVersion(): number {
  try {
    ensureCacheDir();
    if (fs.existsSync(CACHE_VERSION_FILE)) {
      const v = parseInt(fs.readFileSync(CACHE_VERSION_FILE, 'utf-8').trim(), 10);
      return isNaN(v) ? 0 : v;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/** 递增缓存版本号（数据更新时调用） */
function incrementCacheVersion(): void {
  ensureCacheDir();
  currentCacheVersion = readCacheVersion() + 1;
  fs.writeFileSync(CACHE_VERSION_FILE, String(currentCacheVersion), 'utf-8');
}

/** 初始化缓存版本号 */
currentCacheVersion = readCacheVersion();

// ---------------------------------------------------------------------------
// PostgreSQL 数据源（T-ARCH-1.3 主数据源）
// ---------------------------------------------------------------------------

/**
 * PostgreSQL 熔断器
 *
 * 企业理由：dbAvailable 布尔标记置 false 后永不自动恢复，
 * DB 短暂抖动后持续失败，需人工重启才能恢复。
 * 熔断器三态模型（Closed→Open→HalfOpen）提供自动恢复能力：
 * - Closed：正常查询，连续 5 次失败后进入 Open
 * - Open：直接失败，不尝试 DB 连接（避免雪崩）
 * - HalfOpen：10s 后放行 1 次探测查询，成功则恢复 Closed
 * 权衡：熔断器增加复杂度，但自愈能力远优于手动恢复。
 */
const pgCircuitBreaker = new CircuitBreaker(
  async (queryText: string, params?: unknown[]) => {
    // 企业理由：读查询走只读副本（getReadPool），减轻主库连接压力。
    // 熔断器包裹的查询均为读操作（SELECT），适合路由到只读副本。
    const pool = getReadPool();
    return pool.query(queryText, params);
  },
  {
    name: 'postgres',
    timeout: 10000, // 单次查询超时 10s（与 statement_timeout 对齐）
    errorThresholdPercentage: 50, // 50% 失败率触发熔断
    resetTimeout: 10000, // 10s 后进入 HalfOpen 探测
    rollingCountTimeout: 60000, // 统计窗口 60s
    rollingCountBuckets: 6, // 6 个桶，每桶 10s
  },
);

// 熔断器状态变更日志
pgCircuitBreaker.on('open', () => {
  logger.warn('[dataService] PostgreSQL 熔断器 OPEN：后续查询将失败直至恢复');
});
pgCircuitBreaker.on('halfOpen', () => {
  logger.info('[dataService] PostgreSQL 熔断器 HALF-OPEN：放行探测查询');
});
pgCircuitBreaker.on('close', () => {
  logger.info('[dataService] PostgreSQL 熔断器 CLOSED：PostgreSQL 恢复正常');
});

// 注册熔断器指标到 Prometheus
registerCircuitBreakerMetrics('postgres', pgCircuitBreaker);

/** 判断 DB 是否可用（基于熔断器状态） */
function isDbAvailable(): boolean {
  return !pgCircuitBreaker.opened;
}

/**
 * 初始化数据库连接和 schema
 *
 * 企业理由：应用启动时调用，确保 schema 就绪后再接受请求。
 * 如果数据库不可用，后续查询将失败直至熔断器恢复。
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
 * Go 数据服务并发信号量
 *
 * 企业理由（ADR-008）：Go 数据服务替代 Python 子进程后，
 * 并发不再受 Python 进程数限制，但仍需控制对 Go 服务的并发请求数，
 * 防止下游 API（akshare/yfinance）限流导致请求堆积。
 * 信号量限制最大并发为 10，Go 服务本身已有熔断器保护。
 * 权衡：并发超过 10 时请求需排队等待，但避免了级联故障。
 */
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

  /** 当前可用许可数（用于 Prometheus 指标采集） */
  available(): number {
    return this.permits;
  }

  /** 配置的最大许可数 */
  total(): number {
    return this.maxPermits;
  }
}

const goServiceSemaphore = new Semaphore(10);

// 注册信号量指标到 Prometheus（T-P1-1 Saturation）
registerSemaphoreMetrics('go_data_service', goServiceSemaphore.total(), () =>
  goServiceSemaphore.available(),
);

/** 确保缓存目录存在 */
function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/** 生成缓存文件名 */
function getCacheKey(prefix: string, params: Record<string, string>): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50);
  const paramStr = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${sanitize(k)}=${sanitize(v)}`)
    .join('&');
  return `${sanitize(prefix)}_${paramStr}.json`;
}

/** 读取缓存（带版本号校验） */
function readCache(key: string): unknown {
  ensureCacheDir();
  const filePath = path.join(CACHE_DIR, key);
  if (fs.existsSync(filePath)) {
    try {
      // Security (T-06 / OWASP A08)：读取前校验 HMAC 完整性。被篡改或签名缺失的缓存
      // 视为不可信，当作缓存未命中（返回 null 触发重新拉取），避免污染回测结果。
      if (!verifyFileSync(filePath)) {
        logger.warn(
          { service: 'dataService', file: key },
          '[cache] 完整性校验失败，丢弃缓存并重新获取',
        );
        return null;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      // 企业理由：缓存版本号不匹配说明数据已被其他进程/实例更新，
      // 当前缓存已过期，应失效并重新获取。
      // 权衡：每次读取需检查版本号，但这是保证一致性的最小代价。
      if (parsed && typeof parsed === 'object' && '__cacheVersion' in parsed) {
        const latestVersion = readCacheVersion();
        if (parsed.__cacheVersion !== latestVersion) {
          return null; // 版本不匹配，缓存失效
        }
        return parsed.__data !== undefined ? parsed.__data : parsed;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

/** 写入缓存（附带当前版本号） */
function writeCache(key: string, data: unknown): void {
  ensureCacheDir();
  const filePath = path.join(CACHE_DIR, key);
  // 企业理由：写入时附带版本号，读取时可校验是否过期。
  // 权衡：缓存文件体积略增（多一个 __cacheVersion 字段），但保证一致性。
  const wrapper = {
    __cacheVersion: currentCacheVersion,
    __data: data,
  };
  fs.writeFileSync(filePath, JSON.stringify(wrapper), 'utf-8');
  // Security (T-06)：写入后生成 HMAC 签名，供后续读取校验完整性。未配置密钥时静默跳过。
  signFileSync(filePath);
}

/**
 * 调用 Go 数据服务获取数据
 *
 * 企业理由（ADR-008）：替代 Python 子进程调用，消除 Python 运行时依赖。
 * Go 数据服务提供 HTTP API，支持熔断器和限流，比 Python 子进程更可靠。
 * 使用信号量控制并发，防止对 Go 服务的请求堆积。
 */
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
          timeout: 30000,
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

/**
 * 获取历史行情数据
 *
 * 数据源：PostgreSQL；未入库标的可走 Go data-fetcher 实时拉取。
 * 返回格式: { [ticker]: { [date]: closePrice } }
 */
/** 从 PostgreSQL 查询价格数据，返回已有数据和缺失 ticker 列表 */
async function queryPricesFromDb(
  validTickers: string[],
  startDate: string,
  endDate: string,
): Promise<{ result: Record<string, Record<string, number>>; missing: string[] }> {
  const result: Record<string, Record<string, number>> = {};
  const missing: string[] = [];

  if (!isDbAvailable()) {
    return { result, missing: [...validTickers] };
  }

  try {
    const { rows } = await pgCircuitBreaker.fire(
      'SELECT ticker, date, close FROM prices WHERE ticker = ANY($1) AND date >= $2 AND date <= $3 ORDER BY date',
      [validTickers, startDate, endDate],
    );

    const grouped: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      if (!grouped[row.ticker]) grouped[row.ticker] = {};
      const dateStr =
        row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date);
      grouped[row.ticker][dateStr] = row.close;
    }

    for (const ticker of validTickers) {
      if (grouped[ticker] && Object.keys(grouped[ticker]).length > 0) {
        result[ticker] = grouped[ticker];
      } else {
        missing.push(ticker);
      }
    }
  } catch (err) {
    logger.warn({ err }, '[dataService] fetchHistoryData: PostgreSQL 查询失败');
    return { result, missing: [...validTickers] };
  }

  return { result, missing };
}

/** 通过 Go 数据服务并发拉取缺失 ticker 的价格数据 */
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
      writeCache(cacheKey, goResult);
      incrementCacheVersion();
    }
  } catch (err) {
    logger.warn(`[dataService] Go data service failed: ${(err as Error).message}`);
  }

  return goResult;
}

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

  const { result: dbResult, missing: missingTickers } = await queryPricesFromDb(
    validTickers,
    startDate,
    endDate,
  );
  Object.assign(result, dbResult);

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

  const cached = readCache(cacheKey);
  if (cached) {
    Object.assign(result, cached);
    logger.info(
      `[dataService] fetchHistoryData: ${validTickers.length} tickers, ${stillMissing.length} missing (cache hit), took ${Date.now() - fetchStart}ms`,
    );
    return result;
  }

  const goResult = await fetchMissingFromGoService(stillMissing, startDate, endDate, cacheKey);
  Object.assign(result, goResult);

  logger.info(
    `[dataService] fetchHistoryData: ${validTickers.length} tickers, ${stillMissing.length} missing, took ${Date.now() - fetchStart}ms`,
  );
  return result;
}

/**
 * 价格数据缓存（Redis + 内存双写降级）
 *
 * 企业理由（Redis 外部化）：
 * 多实例 K8s 部署时，内存 Map 仅在单进程内可见，
 * 实例 A 缓存的价格数据无法被实例 B 读取，导致：
 * 1. 缓存命中率降低——每实例独立缓存，重复查询走数据库
 * 2. 数据不一致——实例 A 更新数据后实例 B 仍返回旧缓存
 * Redis 集中式缓存确保所有实例共享同一份数据，TTL 自动过期替代 LRU 淘汰。
 * 降级策略：Redis 不可用时自动降级到内存 Map，确保服务可用。
 * 权衡：降级期间多实例缓存不一致，但单实例内仍有效，优于完全无缓存。
 */
const priceDataCache = new Map<string, { data: Record<string, number>; mtimeMs: number }>();
const PRICE_CACHE_REDIS_PREFIX = 'price_cache:';

/** Redis 是否可用（检测后缓存结果，避免每次请求都检测） */
let priceCacheRedisAvailable: boolean | null = null;

/** 检测 Redis 是否可用 */
async function isPriceCacheRedisAvailable(): Promise<boolean> {
  if (priceCacheRedisAvailable !== null) return priceCacheRedisAvailable;
  try {
    await appRedis.ping();
    priceCacheRedisAvailable = true;
    return true;
  } catch {
    priceCacheRedisAvailable = false;
    logger.warn('[dataService] Redis 不可用，价格缓存降级到内存模式');
    return false;
  }
}

// Redis 连接恢复时重置状态
appRedis.on('ready', () => {
  priceCacheRedisAvailable = true;
});

appRedis.on('error', () => {
  priceCacheRedisAvailable = false;
});

/** 删除价格数据缓存（Redis + 内存双删） */
async function deletePriceCache(ticker: string): Promise<void> {
  priceDataCache.delete(ticker);
  const redisOk = await isPriceCacheRedisAvailable();
  if (redisOk) {
    try {
      await appRedis.del(`${PRICE_CACHE_REDIS_PREFIX}${ticker}`);
    } catch (err) {
      logger.warn({ err, ticker }, '[dataService] Redis 价格缓存删除失败');
      priceCacheRedisAvailable = false;
    }
  }
}

/** 清空所有价格数据缓存（Redis + 内存双清） */
async function clearPriceCache(): Promise<void> {
  priceDataCache.clear();
  const redisOk = await isPriceCacheRedisAvailable();
  if (redisOk) {
    try {
      // 使用 SCAN 安全遍历并删除所有 price_cache:* 键
      let cursor = '0';
      do {
        const [nextCursor, keys] = await appRedis.scan(
          cursor,
          'MATCH',
          `${PRICE_CACHE_REDIS_PREFIX}*`,
          'COUNT',
          100,
        );
        if (keys.length > 0) {
          await appRedis.del(...keys);
        }
        cursor = nextCursor;
      } while (cursor !== '0');
    } catch (err) {
      logger.warn({ err }, '[dataService] Redis 价格缓存清空失败');
      priceCacheRedisAvailable = false;
    }
  }
}

/**
 * 验证 ticker 有效性
 *
 * 数据源：PostgreSQL tickers 表
 * 仅检查数据源中是否有记录，不做实时获取，保证快速返回
 */
export async function validateTickers(
  tickers: string[],
): Promise<{ valid: string[]; invalid: string[] }> {
  const valid: string[] = [];
  const invalid: string[] = [];

  // ── 优先级 1：PostgreSQL 查询（T-ARCH-1.3 主数据源） ──
  //
  // 企业理由：PostgreSQL 的 tickers 表是权威数据源，
  // 单次 ANY 查询验证所有 ticker，比逐个读 JSON 文件高效。
  // 参数化查询防止 SQL 注入。
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
 * 搜索资产代码
 *
 * 数据源优先级（T-ARCH-1.3）：PostgreSQL 全文搜索 → Go 数据服务 → mock
 */
/** 验证搜索输入，返回 true 表示合法 */
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

/** PostgreSQL 全文搜索 */
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

export async function searchTickers(query: string, market?: string): Promise<TickerSearchResult[]> {
  if (!validateSearchQuery(query, market)) return [];

  const dbResult = await searchTickersFromDb(query, market);
  if (dbResult !== null) return dbResult;

  const cacheKey = getCacheKey('search', { query, market: market || 'all' });
  const cached = readCache(cacheKey);
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
      writeCache(cacheKey, data);
      incrementCacheVersion();
      return data;
    }
    return [];
  } catch (err) {
    logger.warn(`Go data service search failed, using mock results: ${(err as Error).message}`);
    return mockSearchResults(query);
  }
}

/**
 * 模拟搜索结果（fallback）
 */
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

/**
 * 缓存失效函数
 *
 * 企业理由：数据更新后旧缓存必须主动失效，否则用户会看到过期数据。
 * 支持按 ticker 精确失效（节省其他缓存）和全量失效（数据批量更新时）。
 * Redis + 内存双删确保所有实例缓存一致失效。
 * 权衡：全量失效会导致短暂缓存命中率下降，但数据一致性优先于性能。
 *
 * @param ticker - 可选，指定失效某个 ticker 的缓存；不传则全量失效
 */
export async function invalidateCache(ticker?: string): Promise<void> {
  if (ticker) {
    // 按 ticker 失效：清除该 ticker 的 Redis + 内存缓存和磁盘缓存文件
    await deletePriceCache(ticker);

    // 删除该 ticker 相关的磁盘缓存文件
    ensureCacheDir();
    try {
      const files = fs.readdirSync(CACHE_DIR);
      const prefix = ticker.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50);
      for (const file of files) {
        if (file.startsWith(`history_${prefix}=`) || file.includes(`=${prefix}&`)) {
          fs.unlinkSync(path.join(CACHE_DIR, file));
        }
      }
    } catch {
      /* ignore */
    }

    logger.info(`[dataService] invalidateCache: ticker=${ticker}`);
  } else {
    // 全量失效：递增版本号使所有旧缓存自动失效，清空 Redis + 内存
    incrementCacheVersion();
    await clearPriceCache();

    logger.info(`[dataService] invalidateCache: 全量失效, new version=${currentCacheVersion}`);
  }
}
