// Redis 静默守护 helpers（ADR-008 降级语义）：失败标记不可用 + 记日志，不抛出。
// 独立模块避免被测试整模块 mock redisClient 时遮蔽（tests 以 appRedis/getRedisHealth/markRedisUnhealthy 重建 mock）。
import { logger } from '../utils/logger.js';
import { appRedis, markRedisUnhealthy } from './redisClient.js';

export async function silentRedis<T>(
  fn: () => Promise<T>,
  logMsg: string,
  ctx: Record<string, unknown> = {},
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    markRedisUnhealthy();
    logger.warn({ err: String(err), ...ctx }, logMsg);
    return null;
  }
}

export async function scanDelKeys(pattern: string): Promise<void> {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await appRedis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) await appRedis.del(...keys);
  } while (cursor !== '0');
}
