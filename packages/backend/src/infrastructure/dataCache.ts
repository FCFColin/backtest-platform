import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile, access, readdir, unlink } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { signFile, verifyFile } from '../utils/integrity.js';
import { recordCacheHit } from '../utils/metrics.js';
import { appRedis } from './redisClient.js';
import { getRedisHealth, markRedisUnhealthy } from './redisHealth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = resolve(__dirname, '../../data/cache');

const CACHE_VERSION_FILE = join(CACHE_DIR, '.cache_version');
let currentCacheVersion = 0;

/** @internal 测试专用：生产代码仅模块内调用，外部仅单元测试直接访问 */
async function readCacheVersion(): Promise<number> {
  try {
    ensureCacheDir();
    const content = await readFile(CACHE_VERSION_FILE, 'utf-8').catch(() => null);
    if (content !== null) {
      const v = parseInt(content.trim(), 10);
      return isNaN(v) ? 0 : v;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

async function incrementCacheVersion(): Promise<void> {
  ensureCacheDir();
  currentCacheVersion = (await readCacheVersion()) + 1;
  await writeFile(CACHE_VERSION_FILE, String(currentCacheVersion), 'utf-8');
  // 版本递增后异步清理旧版本缓存文件（fire-and-forget，不阻塞调用方）
  void cleanStaleCacheFiles();
}

/**
 * 扫描 CACHE_DIR，删除版本号不匹配的缓存文件、损坏文件及孤儿 .sig 文件。
 *
 * 企业理由：缓存版本递增后旧版本文件不再命中（readCache 已跳过），
 * 但残留文件会持续占用磁盘。启动时也需清理上次异常退出遗留的孤儿文件。
 */
async function cleanStaleCacheFiles(): Promise<void> {
  try {
    ensureCacheDir();
    const entries = await readdir(CACHE_DIR);
    const jsonFiles = entries.filter((f) => f.endsWith('.json'));
    const sigFiles = entries.filter((f) => f.endsWith('.sig'));

    let deleted = 0;
    for (const file of jsonFiles) {
      const filePath = join(CACHE_DIR, file);
      try {
        const content = await readFile(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (
          parsed &&
          typeof parsed === 'object' &&
          '__cacheVersion' in parsed &&
          parsed.__cacheVersion === currentCacheVersion
        ) {
          continue; // 版本匹配，保留
        }
      } catch {
        // JSON 解析失败或读取异常 → 视为损坏文件，删除
      }
      await unlink(filePath).catch(() => {});
      await unlink(filePath + '.sig').catch(() => {});
      deleted++;
    }

    // 清理孤儿 .sig 文件（对应的 .json 已不存在）
    const jsonFileSet = new Set(jsonFiles);
    for (const sigFile of sigFiles) {
      const correspondingJson = sigFile.slice(0, -4); // 去掉 .sig 后缀
      if (!jsonFileSet.has(correspondingJson)) {
        await unlink(join(CACHE_DIR, sigFile)).catch(() => {});
        deleted++;
      }
    }

    if (deleted > 0) {
      logger.info(
        { service: 'dataService', deleted, currentCacheVersion },
        '[cache] 清理过期/孤儿缓存文件',
      );
    }
  } catch (err) {
    logger.warn({ err, service: 'dataService' }, '[cache] 缓存文件清理失败');
  }
}

currentCacheVersion = await readCacheVersion();
// 启动时清理孤儿/过期缓存文件（fire-and-forget，不阻塞模块加载）
void cleanStaleCacheFiles();

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

async function readCache(key: string): Promise<unknown> {
  ensureCacheDir();
  const filePath = join(CACHE_DIR, key);
  try {
    await access(filePath);
  } catch {
    recordCacheHit('file_cache', false);
    return null;
  }
  try {
    if (!(await verifyFile(filePath))) {
      logger.warn(
        { service: 'dataService', file: key },
        '[cache] 完整性校验失败，丢弃缓存并重新获取',
      );
      recordCacheHit('file_cache', false);
      return null;
    }
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && '__cacheVersion' in parsed) {
      const latestVersion = await readCacheVersion();
      if (parsed.__cacheVersion !== latestVersion) {
        recordCacheHit('file_cache', false);
        return null;
      }
      recordCacheHit('file_cache', true);
      return parsed.__data !== undefined ? parsed.__data : parsed;
    }
    recordCacheHit('file_cache', true);
    return parsed;
  } catch {
    recordCacheHit('file_cache', false);
    return null;
  }
}

async function writeCache(key: string, data: unknown): Promise<void> {
  ensureCacheDir();
  const filePath = join(CACHE_DIR, key);
  const wrapper = {
    __cacheVersion: currentCacheVersion,
    __data: data,
  };
  await writeFile(filePath, JSON.stringify(wrapper), 'utf-8');
  await signFile(filePath);
}

const priceDataCache = new Map<string, { data: Record<string, number>; mtimeMs: number }>();
const PRICE_CACHE_REDIS_PREFIX = 'price_cache:';
const PRICE_CACHE_TTL_SEC = 86400; // 24 小时

async function deletePriceCache(ticker: string): Promise<void> {
  priceDataCache.delete(ticker);
  const redisOk = await getRedisHealth();
  if (redisOk) {
    try {
      await appRedis.del(`${PRICE_CACHE_REDIS_PREFIX}${ticker}`);
    } catch (err) {
      logger.warn({ err, ticker }, '[dataService] Redis 价格缓存删除失败');
      markRedisUnhealthy();
    }
  }
}

async function clearPriceCache(): Promise<void> {
  priceDataCache.clear();
  const redisOk = await getRedisHealth();
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
      markRedisUnhealthy();
    }
  }
}

async function setPriceCache(ticker: string, data: Record<string, number>): Promise<void> {
  priceDataCache.set(ticker, { data, mtimeMs: Date.now() });
  const redisOk = await getRedisHealth();
  if (redisOk) {
    try {
      await appRedis.set(
        `${PRICE_CACHE_REDIS_PREFIX}${ticker}`,
        JSON.stringify(data),
        'EX',
        PRICE_CACHE_TTL_SEC,
      );
    } catch (err) {
      logger.warn({ err, ticker }, '[dataService] Redis 价格缓存写入失败');
      markRedisUnhealthy();
    }
  }
}

/**
 * 失效指定标的的缓存：删除内存价格缓存 + 相关磁盘 history 文件。
 *
 * @param ticker - 待失效的标的代码
 */
async function invalidateTickerCache(ticker: string): Promise<void> {
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
}

/**
 * 全量失效缓存：递增版本号 + 清空价格缓存。
 */
async function invalidateAllCache(): Promise<void> {
  await incrementCacheVersion();
  await clearPriceCache();

  logger.info(`[dataService] invalidateCache: 全量失效, new version=${currentCacheVersion}`);
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
  setPriceCache,
  invalidateTickerCache,
  invalidateAllCache,
};
