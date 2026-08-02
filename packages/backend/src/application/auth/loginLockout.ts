/**
 * 登录失败计数与账户锁定（T-12 / OWASP A07 / 等保三级 8.1.4 b)
 *
 * 双层防护：
 * 1. 用户名维度：连续 5 次失败 → 15 分钟锁定（防止针对单账户暴力破解）
 * 2. IP 维度：5 分钟内 10 次失败 → 1 小时封锁（防止分布式用户名枚举/撞库）
 *
 * 锁定基于用户名/IP 而非账户行级标志，避免给攻击者"该用户名存在"的枚举信号。
 *
 * ADR-045：Redis 故障时不再降级到内存（跨 Pod 不一致 → 暴力破解防护失效），
 * 改为抛 RedisUnavailableError，登录路由由 asyncRouteHandler 翻译为 503。
 */
import { appRedis } from '../../infrastructure/redisClient.js';
import { logger } from '../../utils/logger.js';
import { requireRedis } from '../../utils/redisFallback.js';
import { config } from '../../config/index.js';
import { authIpLockoutCounter } from '../../utils/metrics.js';
import { createHash } from 'node:crypto';

/** 用户名维度：触发锁定的连续失败次数阈值 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SEC = 15 * 60;
const FAILURE_WINDOW_SEC = 15 * 60;

const KEY_PREFIX = 'login_fail:';
const LOCK_PREFIX = 'login_lock:';

/** IP 维度：异常登录检测（等保三级 8.1.4 b) 自动化检测异常登录行为） */
const IP_FAIL_PREFIX = 'login_ip_fail:';
const IP_LOCK_PREFIX = 'login_ip_lock:';

/**
 * 对 IP 进行 SHA-256 哈希，避免存储原始 IP（GDPR 友好，等保三级个人信息保护）。
 *
 * @param ip - 原始客户端 IP
 * @returns SHA-256 哈希的十六进制字符串
 */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * 检查账户是否处于锁定状态。
 * @returns 锁定中返回剩余秒数；未锁定返回 0
 */
export async function isLockedOut(username: string): Promise<number> {
  const key = LOCK_PREFIX + normalize(username);
  return requireRedis(key, async () => {
    const ttl = await appRedis.ttl(key);
    return ttl > 0 ? ttl : 0;
  });
}

/** 记录一次登录失败。达到阈值时锁定账户。 */
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

/** 登录成功后清除失败计数与锁定。 */
export async function clearFailures(username: string): Promise<void> {
  const norm = normalize(username);
  const failKey = KEY_PREFIX + norm;
  const lockKey = LOCK_PREFIX + norm;
  await requireRedis(failKey, async () => {
    await appRedis.del(failKey, lockKey);
  });
}

// IP 维度异常登录检测（P1-09 等保三级 8.1.4 b)

/**
 * 检查 IP 是否因异常登录行为被封锁。
 *
 * @param ip - 客户端 IP 地址
 * @returns 封锁中返回剩余秒数；未封锁返回 0
 */
export async function isIpBlocked(ip: string): Promise<number> {
  if (!ip) return 0;
  const key = IP_LOCK_PREFIX + hashIp(ip);
  return requireRedis(key, async () => {
    const ttl = await appRedis.ttl(key);
    return ttl > 0 ? ttl : 0;
  });
}

/**
 * 记录一次 IP 维度的登录失败。
 * 达到阈值（默认 5 分钟内 10 次）时封锁 IP。
 *
 * @param ip - 客户端 IP 地址
 */
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

/**
 * 综合检查登录是否被限制（用户名锁定 + IP 封锁）。
 *
 * @param username - 用户名
 * @param ip - 客户端 IP 地址
 * @returns { locked, reason, ttlSec } — locked=true 时拒绝登录
 */
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
