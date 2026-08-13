// DADR-045: HA 架构下 Redis 故障时内存降级是反模式（跨 Pod 状态不一致）
// 本模块统一封装 requireRedis：不可用时抛 RedisUnavailableError，由路由层翻译为 503
import { getRedisHealth, markRedisUnhealthy } from '../infrastructure/redisClient.js';
import { logger } from './logger.js';
import { RedisUnavailableError } from './errors.js';

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
