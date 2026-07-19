/**
 * Redis 健康检测统一模块
 *
 * 集中管理 Redis 连接状态，取代 refreshToken / idempotency / loginLockout /
 * dataCacheService / backtestResultCache 各自维护的本地 boolean flag + listener + ping 实现。
 *
 * - 缓存最近一次 ping/事件结果（5 秒 TTL），避免高频调用
 * - 监听 redisClient 的 ready/reconnecting/end/error 事件，立即更新状态
 * - 异步 API getRedisHealth() / 标记 API markRedisUnhealthy()
 * - markRedisUnhealthy() 供 Redis 命令执行失败时立即标记不可用，
 *   避免 5 秒缓存窗口内反复重试已知不可用的 Redis
 */
import { appRedis } from './redisClient.js';

const CACHE_TTL_MS = 5000;

let cached = false;
let lastCheck = 0;

function setHealth(ok: boolean): void {
  lastCheck = Date.now();
  cached = ok;
}

appRedis.on('ready', () => setHealth(true));
appRedis.on('reconnecting', () => setHealth(false));
appRedis.on('end', () => setHealth(false));
appRedis.on('error', () => setHealth(false));

/**
 * 异步获取 Redis 健康状态（带 5 秒缓存）。
 *
 * @returns Redis 是否可用
 */
export async function getRedisHealth(): Promise<boolean> {
  if (Date.now() - lastCheck < CACHE_TTL_MS) {
    return cached;
  }
  try {
    const result = await appRedis.ping();
    setHealth(result === 'PONG');
    return cached;
  } catch {
    setHealth(false);
    return false;
  }
}

/**
 * 立即标记 Redis 为不可用（操作失败时调用）。
 *
 * 用于 Redis 命令执行失败但尚未触发 error 事件的场景，
 * 避免 5 秒缓存窗口内反复重试已知不可用的 Redis。
 */
export function markRedisUnhealthy(): void {
  setHealth(false);
}
