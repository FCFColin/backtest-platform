/**
 * 登录失败计数与账户锁定（T-12 / OWASP A07 Authentication Failures）
 *
 * 企业为何需要：仅靠 IP 限流不足以防暴力破解——攻击者可用分布式 IP 池绕过。
 * 按"用户名"维度计数失败并在阈值后临时锁定，是 OWASP 推荐的纵深防御。
 * 与 IP 限流（app.ts）组合：IP 限流挡住单点高频，账户锁定挡住分布式低频撞库。
 *
 * 权衡：
 * - 使用 Redis 计数（跨实例一致），不可用时回退内存（单实例有效），保证开发零依赖。
 * - 锁定基于用户名而非账户行级标志，避免给攻击者"该用户名存在"的枚举信号
 *   （锁定与否不改变登录失败的统一响应）。
 */
import { appRedis } from '../../infrastructure/redisClient.js';
import { getRedisHealth } from '../../infrastructure/redisHealth.js';
import { logger } from '../../utils/logger.js';

/** 触发锁定的连续失败次数阈值 */
const MAX_FAILED_ATTEMPTS = 5;
/** 锁定时长（秒） */
const LOCKOUT_DURATION_SEC = 15 * 60;
/** 失败计数窗口（秒）——窗口内累计失败 */
const FAILURE_WINDOW_SEC = 15 * 60;

const KEY_PREFIX = 'login_fail:';
const LOCK_PREFIX = 'login_lock:';

/** 内存回退存储（Redis 不可用时使用，单实例有效） */
const memFailures = new Map<string, { count: number; expiresAt: number }>();
const memLocks = new Map<string, number>();

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * 检查账户是否处于锁定状态。
 * @returns 锁定中返回剩余秒数；未锁定返回 0
 */
export async function isLockedOut(username: string): Promise<number> {
  const key = LOCK_PREFIX + normalize(username);
  if (await getRedisHealth()) {
    const ttl = await appRedis.ttl(key);
    return ttl > 0 ? ttl : 0;
  }
  const until = memLocks.get(key);
  if (until && until > Date.now()) {
    return Math.ceil((until - Date.now()) / 1000);
  }
  return 0;
}

/**
 * 记录一次登录失败。达到阈值时锁定账户。
 */
export async function recordFailure(username: string): Promise<void> {
  const norm = normalize(username);
  const failKey = KEY_PREFIX + norm;
  const lockKey = LOCK_PREFIX + norm;

  if (await getRedisHealth()) {
    const count = await appRedis.incr(failKey);
    if (count === 1) {
      await appRedis.expire(failKey, FAILURE_WINDOW_SEC);
    }
    if (count >= MAX_FAILED_ATTEMPTS) {
      await appRedis.set(lockKey, '1', 'EX', LOCKOUT_DURATION_SEC);
      await appRedis.del(failKey);
      logger.warn({ username: norm, count }, '[loginLockout] 账户因连续登录失败被锁定');
    }
    return;
  }

  // 内存回退
  const now = Date.now();
  const entry = memFailures.get(failKey);
  const next =
    entry && entry.expiresAt > now
      ? { count: entry.count + 1, expiresAt: entry.expiresAt }
      : { count: 1, expiresAt: now + FAILURE_WINDOW_SEC * 1000 };
  memFailures.set(failKey, next);
  if (next.count >= MAX_FAILED_ATTEMPTS) {
    memLocks.set(lockKey, now + LOCKOUT_DURATION_SEC * 1000);
    memFailures.delete(failKey);
    logger.warn(
      { username: norm, count: next.count },
      '[loginLockout] 账户因连续登录失败被锁定（内存模式）',
    );
  }
}

/**
 * 登录成功后清除失败计数与锁定。
 */
export async function clearFailures(username: string): Promise<void> {
  const norm = normalize(username);
  if (await getRedisHealth()) {
    await appRedis.del(KEY_PREFIX + norm, LOCK_PREFIX + norm);
    return;
  }
  memFailures.delete(KEY_PREFIX + norm);
  memLocks.delete(LOCK_PREFIX + norm);
}
