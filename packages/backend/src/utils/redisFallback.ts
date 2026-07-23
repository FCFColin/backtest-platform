/**
 * Redis 降级执行 helper
 *
 * 统一封装 "Redis 健康则执行 redisFn，失败或不可用则降级到 memFn" 的模式，
 * 消除 refreshToken / tokenRotation / loginLockout / jobIdempotency 等模块
 * 中重复的 getRedisHealth 检查 + try/catch + markRedisUnhealthy + 回退逻辑。
 */

import { getRedisHealth, markRedisUnhealthy } from '../infrastructure/redisClient.js';
import { logger } from './logger.js';

/**
 * 执行 Redis 操作并在失败或 Redis 不可用时降级到内存回退实现。
 *
 * 语义：先查询 Redis 健康状态；不可用直接走 memFn；可用则尝试 redisFn，
 * redisFn 抛错时记录 warning、调用 markRedisUnhealthy 并降级到 memFn。
 *
 * @param key - 用于日志上下文的键（如 Redis key 或操作名）
 * @param redisFn - Redis 健康时执行的操作
 * @param memFn - Redis 不可用或 Redis 操作失败时的回退实现
 * @returns 两条路径之一的返回值
 */
export async function withRedisFallback<T>(
  key: string,
  redisFn: () => Promise<T>,
  memFn: () => Promise<T> | T,
): Promise<T> {
  if (!(await getRedisHealth())) {
    return memFn();
  }
  try {
    return await redisFn();
  } catch (err) {
    logger.warn({ err: String(err), key }, '[redis] 操作失败，回退到内存模式');
    markRedisUnhealthy();
    return memFn();
  }
}
