/**
 * 回测结果短期内存 LRU 缓存（sync 响应裁剪后，tab 切换零二次引擎调用）
 */
import crypto from 'node:crypto';
import type { BacktestResult, Portfolio, BacktestParameters } from '../../shared/types.js';

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 50;

interface CacheEntry {
  result: BacktestResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * 根据请求体生成缓存键（portfolios + parameters）。
 *
 * @param portfolios - 组合配置
 * @param parameters - 回测参数
 * @returns SHA-256 十六进制摘要
 */
export function backtestCacheKey(portfolios: Portfolio[], parameters: BacktestParameters): string {
  const payload = JSON.stringify({ portfolios, parameters });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * 写入未裁剪的引擎结果。
 *
 * @param key - {@link backtestCacheKey} 返回值
 * @param result - 完整回测结果
 */
export function setBacktestResultCache(key: string, result: BacktestResult): void {
  evictExpired();
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
  cache.set(key, { result, expiresAt: Date.now() + TTL_MS });
}

/**
 * 读取缓存中的完整结果（命中时刷新 LRU 顺序）。
 *
 * @param key - 缓存键
 * @returns 完整结果，未命中或过期返回 null
 */
export function getBacktestResultCache(key: string): BacktestResult | null {
  evictExpired();
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.result;
}

/** 测试用：清空缓存 */
export function clearBacktestResultCache(): void {
  cache.clear();
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}
