/**
 * RBAC 用户权限 Redis 缓存（P2-01）
 *
 * 企业理由：可配置 RBAC 将权限映射下沉到数据库后，每个需鉴权请求都要查 DB
 * 聚合用户权限（user_roles JOIN role_permissions），在高 QPS 下会成为瓶颈。
 * 用 Redis 缓存用户权限集合（TTL 5 分钟），命中时零 DB 往返。
 *
 * 容错策略：Redis 不可用时缓存函数静默失败——get 返回 null（视为 miss，回退查 DB），
 * set/invalidate 吞掉错误（不影响主流程）。隔离边界：缓存仅是加速层，DB 是真相源。
 *
 * 权衡：5 分钟 TTL 内权限变更对其他实例不可见（eventual consistency），
 * 由 invalidateUserPermissions 在角色变更时主动清除缓解；全量失效由
 * invalidateOrgRolePermissions 按组织扫描清除。
 */
import { appRedis, markRedisUnhealthy } from './redisClient.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/** 缓存键前缀：rbac:user_perms:{userId} */
const USER_PERMS_PREFIX = 'rbac:user_perms:';

/** 角色权限缓存键前缀：rbac:role_perms:{orgId}:{roleId}（按组织批量失效） */
const ROLE_PERMS_PREFIX = 'rbac:role_perms:';

/** 缓存 TTL（秒），来自 RBAC_CACHE_TTL_SEC 环境变量，默认 300（5 分钟） */
const TTL_SEC = config.RBAC_CACHE_TTL_SEC;

/**
 * 构造用户权限缓存键。
 *
 * @param userId - 用户 UUID
 * @returns 缓存键字符串
 */
function userPermsKey(userId: string): string {
  return `${USER_PERMS_PREFIX}${userId}`;
}

/**
 * 读取用户权限缓存。
 *
 * @param userId - 用户 UUID
 * @returns 权限字符串数组（命中），或 null（未命中/Redis 不可用）
 */
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

/**
 * 写入用户权限缓存。
 *
 * 权限数组序列化为 JSON 存储，空数组存为 "[]" 以区分"缓存空集"与"未缓存"。
 *
 * @param userId - 用户 UUID
 * @param permissions - 权限字符串数组
 */
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

/**
 * 失效单个用户的权限缓存（用户角色变更时调用）。
 *
 * @param userId - 用户 UUID
 */
export async function invalidateUserPermissions(userId: string): Promise<void> {
  try {
    await appRedis.del(userPermsKey(userId));
  } catch (err) {
    markRedisUnhealthy();
    logger.warn({ err: String(err), userId }, '[rbacCache] 失效用户权限缓存失败');
  }
}

/**
 * 批量失效组织内角色权限缓存（角色权限变更时调用）。
 *
 * 扫描并删除匹配 `rbac:role_perms:{orgId}:*` 的所有键。
 * 使用 SCAN（非 KEYS）避免阻塞 Redis 主线程。
 *
 * @param orgId - 组织 UUID
 */
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
