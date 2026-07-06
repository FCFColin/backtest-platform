import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { signFileSync, verifyFileSync } from '../utils/integrity.js';
import { appRedis } from '../config/redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = resolve(__dirname, '../../data/cache');

const CACHE_VERSION_FILE = join(CACHE_DIR, '.cache_version');
let currentCacheVersion = 0;

function readCacheVersion(): number {
  try {
    ensureCacheDir();
    if (existsSync(CACHE_VERSION_FILE)) {
      const v = parseInt(readFileSync(CACHE_VERSION_FILE, 'utf-8').trim(), 10);
      return isNaN(v) ? 0 : v;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function incrementCacheVersion(): void {
  ensureCacheDir();
  currentCacheVersion = readCacheVersion() + 1;
  writeFileSync(CACHE_VERSION_FILE, String(currentCacheVersion), 'utf-8');
}

currentCacheVersion = readCacheVersion();

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(prefix: string, params: Record<string, string>): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50);
  const paramStr = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${sanitize(k)}=${sanitize(v)}`)
    .join('&');
  return `${sanitize(prefix)}_${paramStr}.json`;
}

function readCache(key: string): unknown {
  ensureCacheDir();
  const filePath = join(CACHE_DIR, key);
  if (existsSync(filePath)) {
    try {
      if (!verifyFileSync(filePath)) {
        logger.warn(
          { service: 'dataService', file: key },
          '[cache] 完整性校验失败，丢弃缓存并重新获取',
        );
        return null;
      }
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && '__cacheVersion' in parsed) {
        const latestVersion = readCacheVersion();
        if (parsed.__cacheVersion !== latestVersion) {
          return null;
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

function writeCache(key: string, data: unknown): void {
  ensureCacheDir();
  const filePath = join(CACHE_DIR, key);
  const wrapper = {
    __cacheVersion: currentCacheVersion,
    __data: data,
  };
  writeFileSync(filePath, JSON.stringify(wrapper), 'utf-8');
  signFileSync(filePath);
}

const priceDataCache = new Map<string, { data: Record<string, number>; mtimeMs: number }>();
const PRICE_CACHE_REDIS_PREFIX = 'price_cache:';

let priceCacheRedisAvailable: boolean | null = null;

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

appRedis.on('ready', () => {
  priceCacheRedisAvailable = true;
});

appRedis.on('error', () => {
  priceCacheRedisAvailable = false;
});

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

async function clearPriceCache(): Promise<void> {
  priceDataCache.clear();
  const redisOk = await isPriceCacheRedisAvailable();
  if (redisOk) {
    try {
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

export {
  CACHE_DIR,
  currentCacheVersion,
  readCacheVersion,
  incrementCacheVersion,
  ensureCacheDir,
  getCacheKey,
  readCache,
  writeCache,
  deletePriceCache,
  clearPriceCache,
};
