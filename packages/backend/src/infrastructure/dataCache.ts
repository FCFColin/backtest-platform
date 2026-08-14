// P0-01: L1 LRU + L2 Redis 两级缓存；Redis 不可用时 L2 静默跳过（ADR-008）；多租户 key 前缀（ADR-009）
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { recordCacheHit, recordCacheEviction } from '../utils/metrics.js';
import { appRedis, getRedisHealth, markRedisUnhealthy } from './redisClient.js';
import { silentRedis, scanDelKeys } from './redisGuard.js';

const HISTORY_CACHE_TTL_SEC = 86400;
const SEARCH_CACHE_TTL_SEC = 3600;
const L1_MAX_ENTRIES = 1000;
const L1_TTL_MS = 5 * 60 * 1000;
const COMPRESS_THRESHOLD_BYTES = 1024;
const GZIP_PREFIX = 'gzip:';
const CACHE_KEY_PREFIX = 'cache:org:';

interface L1Entry {
  data: unknown;
  expiresAt: number;
}
const l1Cache = new Map<string, L1Entry>();

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
function l1Clear(): void {
  l1Cache.clear();
}
function evictExpiredL1(): void {
  const now = Date.now();
  for (const [key, entry] of l1Cache) if (now > entry.expiresAt) l1Cache.delete(key);
}

function sanitize(s: string): string {
  // 非法字符用 ~ 替换（不在 [a-zA-Z0-9._-] 内），避免 tickers=SPY,AAPL 与 SPY_AAPL 撞 key
  const cleaned = s.replace(/[^a-zA-Z0-9._-]/g, '~');
  if (cleaned.length <= 50) return cleaned;
  return `${cleaned.slice(0, 41)}~${createHash('sha1').update(s).digest('hex').slice(0, 8)}`;
}
function getCacheKey(type: string, params: Record<string, string>): string {
  const paramStr = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${sanitize(k)}=${sanitize(v)}`)
    .join('&');
  return `${CACHE_KEY_PREFIX}shared:${sanitize(type)}:${paramStr}`;
}

function serialize(data: unknown): string {
  const json = JSON.stringify(data);
  return json.length > COMPRESS_THRESHOLD_BYTES
    ? GZIP_PREFIX + gzipSync(Buffer.from(json, 'utf-8')).toString('base64')
    : json;
}
function deserialize(raw: string): unknown | null {
  try {
    if (raw.startsWith(GZIP_PREFIX))
      return JSON.parse(
        gunzipSync(Buffer.from(raw.slice(GZIP_PREFIX.length), 'base64')).toString('utf-8'),
      );
    return JSON.parse(raw);
  } catch (err) {
    logger.warn({ err, service: 'dataService' }, '[cache] 缓存反序列化失败，丢弃');
    return null;
  }
}

async function readCache(key: string): Promise<unknown> {
  const l1 = l1Get(key);
  if (l1 !== null) {
    recordCacheHit('data_cache_l1', true);
    return l1;
  }
  if (!(await getRedisHealth())) {
    recordCacheHit('data_cache_l2', false);
    return null;
  }
  try {
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

async function writeCache(key: string, data: unknown, ttlSec: number): Promise<void> {
  l1Set(key, data);
  if (!(await getRedisHealth())) return;
  await silentRedis(
    () => appRedis.set(key, serialize(data), 'EX', ttlSec),
    '[cache] Redis 写入失败，仅保留 L1',
    { key, service: 'dataService' },
  );
}

async function scanDel(pattern: string): Promise<void> {
  if (!(await getRedisHealth())) return;
  await silentRedis(() => scanDelKeys(pattern), '[cache] Redis 批量删除失败', {
    pattern,
    service: 'dataService',
  });
}

async function invalidateAllCache(): Promise<void> {
  l1Clear();
  await scanDel(`${CACHE_KEY_PREFIX}*`);
  logger.info('[dataService] invalidateCache: 全量失效 (L1 清空 + Redis cache:org:* 删除)');
}

export {
  HISTORY_CACHE_TTL_SEC,
  SEARCH_CACHE_TTL_SEC,
  getCacheKey,
  readCache,
  writeCache,
  invalidateAllCache,
};
