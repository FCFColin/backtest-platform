/**
 * Redis 操作守卫（ADR-045：取代内存降级）
 *
 * HA（Sentinel）架构下，Redis 故障时静默降级到进程内 Map 是反模式：
 * 跨 Pod 状态不一致会导致刷新令牌无法验证、幂等键失效、暴力破解防护失效。
 * 本模块统一封装"Redis 不可用即抛 RedisUnavailableError"语义，由路由层
 * asyncRouteHandler/crudRouteHandler 自动翻译为 503 + RFC 7807 响应。
 *
 * 历史：本模块原为 `withRedisFallback(key, redisFn, memFn)`，提供内存回退。
 * ADR-045 删除 memFn 路径，重命名为 `requireRedis` 并显式抛错。
 */

import { getRedisHealth, markRedisUnhealthy } from '../infrastructure/redisClient.js';
import { logger } from './logger.js';
import { RedisUnavailableError } from './errors.js';

/**
 * 执行 Redis 操作；不可用或失败时抛 {@link RedisUnavailableError}。
 *
 * 语义：
 * 1. 先查询 Redis 健康状态；不可用 → 抛 RedisUnavailableError
 * 2. 可用则执行 redisFn；redisFn 抛错时记录 warning、调用 markRedisUnhealthy、
 *    将底层错误包装为 RedisUnavailableError 重新抛出
 *
 * @param key - 用于日志上下文的键（如 Redis key 或操作名）
 * @param redisFn - Redis 操作
 * @returns redisFn 的返回值
 * @throws {RedisUnavailableError} Redis 不可用或操作失败
 */
export async function requireRedis<T>(key: string, redisFn: () => Promise<T>): Promise<T> {
  if (!(await getRedisHealth())) {
    throw new RedisUnavailableError(`Redis unavailable (key=${key})`);
  }
  try {
    return await redisFn();
  } catch (err) {
    logger.warn({ err: String(err), key }, '[redis] 操作失败，抛出 RedisUnavailableError');
    markRedisUnhealthy();
    throw new RedisUnavailableError(`Redis operation failed (key=${key}): ${String(err)}`);
  }
}
