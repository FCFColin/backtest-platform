/**
 * 登录失败计数与账户锁定（T-12 / OWASP A07 / 等保三级 8.1.4 b)。
 * 双层：用户名 5 次锁定 15 分钟 / IP 5 分钟 10 次封锁 1 小时。ADR-045：Redis 故障抛 503。
 */
import { appRedis } from '../../infrastructure/redisClient.js';
import { logger } from '../../utils/logger.js';
import { requireRedis } from '../../utils/redisFallback.js';
import { config } from '../../config/index.js';
import { authIpLockoutCounter } from '../../utils/metrics.js';
import { createHash } from 'node:crypto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SEC = 15 * 60;
const FAILURE_WINDOW_SEC = 15 * 60;

const KEY_PREFIX = 'login_fail:';
const LOCK_PREFIX = 'login_lock:';

const IP_FAIL_PREFIX = 'login_ip_fail:';
const IP_LOCK_PREFIX = 'login_ip_lock:';

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

export async function isLockedOut(username: string): Promise<number> {
  const key = LOCK_PREFIX + normalize(username);
  return requireRedis(key, async () => {
    const ttl = await appRedis.ttl(key);
    return ttl > 0 ? ttl : 0;
  });
}

export async function recordFailure(username: string): Promise<void> {
  const norm = normalize(username);
  const failKey = KEY_PREFIX + norm;
  const lockKey = LOCK_PREFIX + norm;

  await requireRedis(failKey, async () => {
    const count = await appRedis.incr(failKey);
    if (count === 1) {
      await appRedis.expire(failKey, FAILURE_WINDOW_SEC);
    }
    if (count >= MAX_FAILED_ATTEMPTS) {
      await appRedis.set(lockKey, '1', 'EX', LOCKOUT_DURATION_SEC);
      await appRedis.del(failKey);
      logger.warn({ username: norm, count }, '[loginLockout] 账户因连续登录失败被锁定');
    }
  });
}

export async function clearFailures(username: string): Promise<void> {
  const norm = normalize(username);
  const failKey = KEY_PREFIX + norm;
  const lockKey = LOCK_PREFIX + norm;
  await requireRedis(failKey, async () => {
    await appRedis.del(failKey, lockKey);
  });
}

// IP 维度异常登录检测（P1-09 等保三级 8.1.4 b)

export async function isIpBlocked(ip: string): Promise<number> {
  if (!ip) return 0;
  const key = IP_LOCK_PREFIX + hashIp(ip);
  return requireRedis(key, async () => {
    const ttl = await appRedis.ttl(key);
    return ttl > 0 ? ttl : 0;
  });
}

export async function recordIpFailure(ip: string): Promise<void> {
  if (!ip) return;
  const hashedIp = hashIp(ip);
  const failKey = IP_FAIL_PREFIX + hashedIp;
  const lockKey = IP_LOCK_PREFIX + hashedIp;
  const windowSec = config.ANOMALY_LOGIN_WINDOW_SEC;
  const maxFailures = config.ANOMALY_LOGIN_MAX_FAILURES;
  const lockoutSec = config.ANOMALY_LOGIN_LOCKOUT_SEC;

  await requireRedis(failKey, async () => {
    const count = await appRedis.incr(failKey);
    if (count === 1) {
      await appRedis.expire(failKey, windowSec);
    }
    if (count >= maxFailures) {
      await appRedis.set(lockKey, '1', 'EX', lockoutSec);
      await appRedis.del(failKey);
      authIpLockoutCounter.inc();
      logger.warn({ hashedIp, count }, '[loginLockout] IP 因异常登录频率被封锁', {
        windowSec,
        lockoutSec,
      });
    }
  });
}

export async function checkLoginRestriction(
  username: string,
  ip: string,
): Promise<{ locked: boolean; reason: string; ttlSec: number }> {
  const userTtl = await isLockedOut(username);
  if (userTtl > 0) {
    return { locked: true, reason: 'account_locked', ttlSec: userTtl };
  }
  const ipTtl = await isIpBlocked(ip);
  if (ipTtl > 0) {
    return { locked: true, reason: 'ip_blocked', ttlSec: ipTtl };
  }
  return { locked: false, reason: '', ttlSec: 0 };
}
