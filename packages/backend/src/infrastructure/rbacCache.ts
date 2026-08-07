import { appRedis, markRedisUnhealthy } from './redisClient.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const USER_PERMS_PREFIX = 'rbac:user_perms:';
const ROLE_PERMS_PREFIX = 'rbac:role_perms:';
const TTL_SEC = config.RBAC_CACHE_TTL_SEC;

function userPermsKey(userId: string): string {
  return `${USER_PERMS_PREFIX}${userId}`;
}

export async function getCachedUserPermissions(userId: string): Promise<string[] | null> {
  try {
    const raw = await appRedis.get(userPermsKey(userId));
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as string[];
  } catch (err) {
    markRedisUnhealthy();
    logger.warn({ err: String(err), userId }, '[rbacCache] 读取用户权限缓存失败，视为 miss');
    return null;
  }
}

export async function setCachedUserPermissions(
  userId: string,
  permissions: string[],
): Promise<void> {
  try {
    await appRedis.set(userPermsKey(userId), JSON.stringify(permissions), 'EX', TTL_SEC);
  } catch (err) {
    markRedisUnhealthy();
    logger.warn({ err: String(err), userId }, '[rbacCache] 写入用户权限缓存失败，跳过缓存');
  }
}

export async function invalidateUserPermissions(userId: string): Promise<void> {
  try {
    await appRedis.del(userPermsKey(userId));
  } catch (err) {
    markRedisUnhealthy();
    logger.warn({ err: String(err), userId }, '[rbacCache] 失效用户权限缓存失败');
  }
}

// SCAN（非 KEYS）避免阻塞 Redis 主线程
export async function invalidateOrgRolePermissions(orgId: string): Promise<void> {
  const pattern = `${ROLE_PERMS_PREFIX}${orgId}:*`;
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await appRedis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await appRedis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    markRedisUnhealthy();
    logger.warn({ err: String(err), orgId }, '[rbacCache] 批量失效组织角色权限缓存失败');
  }
}
