/**
 * 回测结果短期缓存（内存 LRU + Redis 二级缓存 + singleflight 去重）。
 *
 * 三层能力：
 * 1. 内存 LRU（TTL 5min，MAX 50）—— 同步快速读取，tab 切换零二次引擎调用
 * 2. Redis 二级缓存（EX TTL）—— 多实例共享、进程重启不丢失
 * 3. Singleflight —— 相同 key 的并发请求共享同一个 Promise，避免惊群效应
 */
import crypto from 'node:crypto';
import type { BacktestResult, Portfolio, BacktestParameters } from '@backtest/shared/types';
import { logger } from '../../utils/logger.js';
import { recordCacheHit } from '../../utils/metrics.js';
import { appRedis, getRedisHealth, markRedisUnhealthy } from '../../infrastructure/redisClient.js';

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 50;

const BACKTEST_CACHE_REDIS_PREFIX = 'backtest_cache:';
const BACKTEST_CACHE_TTL_SEC = 300; // 5 分钟（与 TTL_MS 一致）

interface CacheEntry {
  result: BacktestResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();


const inFlight = new Map<string, Promise<BacktestResult>>();

/**
 * 根据请求体生成缓存键（tenantId + portfolios + parameters）。
 *
 * 企业理由：多租户场景下，相同 portfolio + parameters 但属于不同租户的回测结果
 * 必须落到独立缓存条目，否则会发生跨租户回测结果串扰（A 租户看到 B 租户的回测数据）。
 * 隔离的最终保证由租户键提供，引擎/RLS 不感知缓存层。
 *
 * @param portfolios - 组合配置
 * @param parameters - 回测参数
 * @param tenantId - 租户 ID（来自 req.tenantId，匿名场景可为 undefined）
 * @returns SHA-256 十六进制摘要
 */
export function backtestCacheKey(
  portfolios: Portfolio[],
  parameters: BacktestParameters,
  tenantId: string | undefined,
): string {
  const payload = JSON.stringify({ tenantId, portfolios, parameters });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * 写入未裁剪的引擎结果（同步写入内存 + 异步写入 Redis）。
 *
 * @param key - {@link backtestCacheKey} 返回值
 * @param result - 完整回测结果
 */
export async function setBacktestResultCache(key: string, result: BacktestResult): Promise<void> {
  evictExpired();
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
  cache.set(key, { result, expiresAt: Date.now() + TTL_MS });

  const redisOk = await getRedisHealth();
  if (redisOk) {
    try {
      await appRedis.set(
        `${BACKTEST_CACHE_REDIS_PREFIX}${key}`,
        JSON.stringify(result),
        'EX',
        BACKTEST_CACHE_TTL_SEC,
      );
    } catch (err) {
      logger.warn({ err, key }, '[backtestCache] Redis 写入失败');
      markRedisUnhealthy();
    }
  }
}

/**
 * 读取缓存中的完整结果（内存优先，Redis 兜底；命中时刷新 LRU 顺序）。
 *
 * @param key - 缓存键
 * @returns 完整结果，未命中或过期返回 null
 */
export async function getBacktestResultCache(key: string): Promise<BacktestResult | null> {
  evictExpired();

  const entry = cache.get(key);
  if (entry) {
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
    } else {
      cache.delete(key);
      cache.set(key, entry);
      recordCacheHit('backtest_result_cache', true);
      return entry.result;
    }
  }

  // 2. Redis 兜底（内存未命中时查询分布式缓存）
  const redisOk = await getRedisHealth();
  if (redisOk) {
    try {
      // await 间隙后重新检查内存缓存（其他并发请求可能已回填）
      const entryAfter = cache.get(key);
      if (entryAfter && Date.now() <= entryAfter.expiresAt) {
        cache.delete(key);
        cache.set(key, entryAfter);
        recordCacheHit('backtest_result_cache', true);
        return entryAfter.result;
      }

      const raw = await appRedis.get(`${BACKTEST_CACHE_REDIS_PREFIX}${key}`);
      if (raw) {
        const result = JSON.parse(raw) as BacktestResult;
        // 回填前再次检查，避免覆盖并发写入的更新值
        if (!cache.has(key)) {
          cache.set(key, { result, expiresAt: Date.now() + TTL_MS });
        }
        recordCacheHit('backtest_result_cache', true);
        return result;
      }
    } catch (err) {
      logger.warn({ err, key }, '[backtestCache] Redis 读取失败');
      markRedisUnhealthy();
    }
  }

  recordCacheHit('backtest_result_cache', false);
  return null;
}

/**
 * 获取缓存结果或计算并缓存（singleflight 去重）。
 *
 * 流程：内存/Redis 缓存命中则直接返回；未命中时通过 singleflight 去重，
 * 相同 key 的并发请求共享同一个 Promise，避免惊群效应（cache stampede）。
 * 首个请求执行 compute 并写入缓存，其余请求等待并复用同一结果。
 * 异常时通过 .finally 清理 inFlight，确保失败的 key 不阻塞后续重试。
 *
 * @param key - {@link backtestCacheKey} 返回值
 * @param compute - 缓存未命中时的计算函数（如调用 Go 引擎执行回测）
 * @returns 缓存命中返回缓存结果，否则返回 compute 的结果
 */
export async function getOrCompute(
  key: string,
  compute: () => Promise<BacktestResult>,
): Promise<BacktestResult> {
  const cached = await getBacktestResultCache(key);
  if (cached) return cached;

  // 2. singleflight：相同 key 的并发请求共享同一 Promise
  //    缓存未命中后，首个请求创建 Promise 并写入 inFlight；
  //    后续请求在同步块内发现 inFlight 已存在，直接复用，不重复调用 compute。
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const result = await compute();
    await setBacktestResultCache(key, result);
    return result;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/** 测试用：清空缓存（内存 + Redis best-effort） */
export function clearBacktestResultCache(): void {
  cache.clear();
  inFlight.clear();
  void getRedisHealth().then((ok) => {
    if (!ok) return;
    void (async () => {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await appRedis.scan(
          cursor,
          'MATCH',
          `${BACKTEST_CACHE_REDIS_PREFIX}*`,
          'COUNT',
          100,
        );
        if (keys.length > 0) {
          await appRedis.del(...keys);
        }
        cursor = nextCursor;
      } while (cursor !== '0');
    })().catch(() => {
      /* best-effort */
    });
  });
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}