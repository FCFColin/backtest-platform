/**
 * 数据缓存（L1 进程内 LRU + L2 Redis 两级缓存，P0-01）。
 * L1（Map + TTL 5min，容量 1000）吸收同实例热点读取；L2 Redis 多实例共享、进程重启不丢失。
 * 降级：Redis 不可用时 L2 静默跳过（logger.warn + markRedisUnhealthy），不抛出，符合 ADR-031。
 * 多租户安全（ADR-032）：所有 key 带 `cache:org:{orgId}:` 前缀；市场参考数据默认 orgId='shared' 共享。
 */
import { gzipSync, gunzipSync } from 'node:zlib';
import { logger } from '../utils/logger.js';
import { recordCacheHit, recordCacheEviction } from '../utils/metrics.js';
import { appRedis, getRedisHealth, markRedisUnhealthy } from './redisClient.js';

/** 日线价格数据 TTL（收盘后不变），24 小时。 */
const PRICE_CACHE_TTL_SEC = 86400;
const HISTORY_CACHE_TTL_SEC = 86400;
/** 搜索结果 TTL，1 小时（新标的入库后较短时间内可见）。 */
const SEARCH_CACHE_TTL_SEC = 3600;
/** 实时数据 TTL（预留），5 分钟。当前无实时缓存入口，定义供后续实时行情使用。 */
const REALTIME_CACHE_TTL_SEC = 300;

const L1_MAX_ENTRIES = 1000;
/** L1 条目 TTL（毫秒），与 backtestResultCache 一致。 */
const L1_TTL_MS = 5 * 60 * 1000;
const COMPRESS_THRESHOLD_BYTES = 1024;
/** 压缩数据的存储前缀标记，读取时据此判断是否需解压。 */
const GZIP_PREFIX = 'gzip:';
/** Redis key 总前缀（含 org 隔离槽位）。 */
const CACHE_KEY_PREFIX = 'cache:org:';
const DEFAULT_ORG_ID = 'shared';
const REDIS_SCAN_COUNT = 100;

interface L1Entry {
  data: unknown;
  expiresAt: number;
}

const l1Cache = new Map<string, L1Entry>();

/** 读取 L1：命中时刷新 LRU 顺序（delete + set 移到末尾），过期则剔除。 */
function l1Get(key: string): unknown | null {
  const entry = l1Cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    l1Cache.delete(key);
    return null;
  }
  l1Cache.delete(key);
  l1Cache.set(key, entry);
  return entry.data;
}

/** 写入 L1：超容量时按 LRU 淘汰最旧条目并记录指标，同时顺手清理已过期条目。 */
function l1Set(key: string, data: unknown): void {
  if (l1Cache.size >= L1_MAX_ENTRIES) evictExpiredL1();
  while (l1Cache.size >= L1_MAX_ENTRIES) {
    const oldest = l1Cache.keys().next().value;
    if (!oldest) break;
    l1Cache.delete(oldest);
    recordCacheEviction('l1');
  }
  l1Cache.set(key, { data, expiresAt: Date.now() + L1_TTL_MS });
}

function l1Delete(key: string): void {
  l1Cache.delete(key);
}

function l1Clear(): void {
  l1Cache.clear();
}

function evictExpiredL1(): void {
  const now = Date.now();
  for (const [key, entry] of l1Cache) {
    if (now > entry.expiresAt) l1Cache.delete(key);
  }
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50);
}

/**
 * 生成带 org 隔离前缀的 Redis key。
 * 格式：`cache:org:{orgId}:{type}:{sortedParams}`，参数按名排序以保证相同参数集生成相同 key。
 */
function getCacheKey(type: string, params: Record<string, string>, orgId: string = DEFAULT_ORG_ID): string {
  const paramStr = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${sanitize(k)}=${sanitize(v)}`)
    .join('&');
  return `${CACHE_KEY_PREFIX}${sanitize(orgId)}:${sanitize(type)}:${paramStr}`;
}

/** 构造价格缓存 key：`cache:org:{orgId}:price:{ticker}` */
function priceKey(ticker: string, orgId: string = DEFAULT_ORG_ID): string {
  return getCacheKey('price', { ticker }, orgId);
}

/** 序列化缓存数据：JSON.stringify，超过阈值则 gzip + base64 并加前缀标记。 */
function serialize(data: unknown): string {
  const json = JSON.stringify(data);
  if (json.length > COMPRESS_THRESHOLD_BYTES) {
    return GZIP_PREFIX + gzipSync(Buffer.from(json, 'utf-8')).toString('base64');
  }
  return json;
}

/** 反序列化 Redis 读取的字符串；带 `gzip:` 前缀则 gunzip 后解析。失败返回 null。 */
function deserialize(raw: string): unknown | null {
  try {
    if (raw.startsWith(GZIP_PREFIX)) {
      const buf = Buffer.from(raw.slice(GZIP_PREFIX.length), 'base64');
      return JSON.parse(gunzipSync(buf).toString('utf-8'));
    }
    return JSON.parse(raw);
  } catch (err) {
    logger.warn({ err, service: 'dataService' }, '[cache] 缓存反序列化失败，丢弃');
    return null;
  }
}

/** 读取缓存：L1 命中直接返回；未命中查 L2 Redis，命中则回填 L1；均未命中返回 null。 */
async function readCache(key: string): Promise<unknown> {
  const l1 = l1Get(key);
  if (l1 !== null) {
    recordCacheHit('data_cache_l1', true);
    return l1;
  }
  const redisOk = await getRedisHealth();
  if (!redisOk) {
    recordCacheHit('data_cache_l2', false);
    return null;
  }
  try {
    // await 间隙后重新检查 L1（其他并发请求可能已回填）
    const l1After = l1Get(key);
    if (l1After !== null) {
      recordCacheHit('data_cache_l1', true);
      return l1After;
    }
    const raw = await appRedis.get(key);
    if (!raw) {
      recordCacheHit('data_cache_l2', false);
      return null;
    }
    const data = deserialize(raw);
    if (data === null) {
      recordCacheHit('data_cache_l2', false);
      return null;
    }
    // 回填前再次检查 L1，避免覆盖并发写入的更新值
    if (l1Get(key) === null) l1Set(key, data);
    recordCacheHit('data_cache_l2', true);
    return data;
  } catch (err) {
    logger.warn({ err, key, service: 'dataService' }, '[cache] Redis 读取失败，降级直查 DB');
    markRedisUnhealthy();
    recordCacheHit('data_cache_l2', false);
    return null;
  }
}

/** 写入缓存：L1 写入 + L2 Redis 写入（带 TTL）。Redis 不可用时仅写 L1 并告警，不抛出。 */
async function writeCache(key: string, data: unknown, ttlSec: number): Promise<void> {
  l1Set(key, data);
  const redisOk = await getRedisHealth();
  if (!redisOk) return;
  try {
    await appRedis.set(key, serialize(data), 'EX', ttlSec);
  } catch (err) {
    logger.warn({ err, key, service: 'dataService' }, '[cache] Redis 写入失败，仅保留 L1');
    markRedisUnhealthy();
  }
}

/** 扫描匹配 pattern 的 key 并批量删除（best-effort，失败仅告警）。 */
async function scanDel(pattern: string): Promise<void> {
  const redisOk = await getRedisHealth();
  if (!redisOk) return;
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await appRedis.scan(cursor, 'MATCH', pattern, 'COUNT', REDIS_SCAN_COUNT);
      if (keys.length > 0) await appRedis.del(...keys);
      cursor = nextCursor;
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ err, pattern, service: 'dataService' }, '[cache] Redis 批量删除失败');
    markRedisUnhealthy();
  }
}

/**
 * 删除指定标的的价格缓存（L1 + L2）。
 * 价格 key 由 priceKey() 精确生成，故直接 DEL 而非 SCAN——既高效又避免
 * pattern 与 key 实际格式（`...:price:ticker=SPY`）不匹配导致漏删。
 */
async function deletePriceCache(ticker: string, orgId: string = DEFAULT_ORG_ID): Promise<void> {
  const key = priceKey(ticker, orgId);
  l1Delete(key);
  const redisOk = await getRedisHealth();
  if (!redisOk) return;
  try {
    await appRedis.del(key);
  } catch (err) {
    logger.warn({ err, key, service: 'dataService' }, '[cache] Redis 删除价格缓存失败');
    markRedisUnhealthy();
  }
}

/**
 * 清空价格缓存（L1 全清 + L2 按价格 key 模式扫描删除）。
 * L1 全清是保守策略：清空价格缓存是低频运维操作，L1 短暂空窗由 L2 兜底，可接受。
 */
async function clearPriceCache(): Promise<void> {
  l1Clear();
  await scanDel(`${CACHE_KEY_PREFIX}*:price:*`);
}

/** 写入价格缓存（L1 + L2，TTL 24h）。 */
async function setPriceCache(ticker: string, data: Record<string, number>, orgId: string = DEFAULT_ORG_ID): Promise<void> {
  await writeCache(priceKey(ticker, orgId), data, PRICE_CACHE_TTL_SEC);
}

/**
 * 失效指定标的的缓存：删除价格缓存 + best-effort 清理含该标的的 history/search key。
 * history/search key 以参数明文构造，可通过 SCAN + 客户端子串过滤清理；L1 中对应条目
 * 依赖 TTL（5min）自然过期——单标的失效不应清空整个 L1 以保住其他热点的命中率。
 */
async function invalidateTickerCache(ticker: string, orgId: string = DEFAULT_ORG_ID): Promise<void> {
  await deletePriceCache(ticker, orgId);
  const tickerTok = sanitize(ticker);
  const orgPrefix = `${CACHE_KEY_PREFIX}${sanitize(orgId)}`;
  const redisOk = await getRedisHealth();
  if (!redisOk) {
    logger.info(`[dataService] invalidateCache: ticker=${ticker} (Redis 不可用，仅清 L1 价格)`);
    return;
  }
  try {
    for (const type of ['history', 'search']) {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await appRedis.scan(cursor, 'MATCH', `${orgPrefix}:${type}:*`, 'COUNT', REDIS_SCAN_COUNT);
        const toDelete = keys.filter((k) => k.includes(`tickers=${tickerTok}`) || k.includes(`=${tickerTok}&`));
        if (toDelete.length > 0) await appRedis.del(...toDelete);
        cursor = nextCursor;
      } while (cursor !== '0');
    }
  } catch (err) {
    logger.warn({ err, ticker, service: 'dataService' }, '[cache] 失效 ticker 缓存时 Redis 扫描失败');
    markRedisUnhealthy();
  }
  logger.info(`[dataService] invalidateCache: ticker=${ticker}`);
}

/**
 * 全量失效缓存：清空 L1 + 删除所有 `cache:org:*` key（price/history/search）。
 * Redis SCAN `cache:org:*` 覆盖全部数据缓存；backtest 结果缓存使用独立 `backtest_cache:` 前缀，不受影响。
 */
async function invalidateAllCache(): Promise<void> {
  l1Clear();
  await scanDel(`${CACHE_KEY_PREFIX}*`);
  logger.info('[dataService] invalidateCache: 全量失效 (L1 清空 + Redis cache:org:* 删除)');
}

export {
  PRICE_CACHE_TTL_SEC,
  HISTORY_CACHE_TTL_SEC,
  SEARCH_CACHE_TTL_SEC,
  REALTIME_CACHE_TTL_SEC,
  DEFAULT_ORG_ID,
  getCacheKey,
  readCache,
  writeCache,
  deletePriceCache,
  clearPriceCache,
  setPriceCache,
  invalidateTickerCache,
  invalidateAllCache,
};