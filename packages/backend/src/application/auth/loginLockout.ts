// T-12 / OWASP A07 / 等保三级 8.1.4 b: 用户名 5 次→锁 15min / IP 5min 10 次→封 1h。DADR-045: Redis 故障抛 503
import { appRedis } from '../../infrastructure/redisClient.js';
import { logger } from '../../utils/logger.js';
import { requireRedis } from '../../utils/redisFallback.js';
import { config } from '../../config/index.js';
import { authIpLockoutCounter } from '../../utils/metrics.js';
import { sha256Hex } from '../../utils/crypto.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SEC = 15 * 60;
const FAILURE_WINDOW_SEC = 15 * 60;

const KEY_PREFIX = 'login_fail:';
const LOCK_PREFIX = 'login_lock:';

const IP_FAIL_PREFIX = 'login_ip_fail:';
const IP_LOCK_PREFIX = 'login_ip_lock:';

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

function lockTtl(key: string): Promise<number> {
  return requireRedis(key, async () => {
    const ttl = await appRedis.ttl(key);
    return ttl > 0 ? ttl : 0;
  });
}

export async function isLockedOut(username: string): Promise<number> {
  return lockTtl(LOCK_PREFIX + normalize(username));
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

export async function isIpBlocked(ip: string): Promise<number> {
  if (!ip) return 0;
  return lockTtl(IP_LOCK_PREFIX + sha256Hex(ip));
}

export async function recordIpFailure(ip: string): Promise<void> {
  if (!ip) return;
  const hashedIp = sha256Hex(ip);
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
