/**
 * Refresh Token 管理模块
 *
 * 职责：Refresh Token 的存储（Redis + 内存回退）、刷新、撤销，
 * Token Family 复用检测，用户会话撤销。
 * 从 jwtAuth.ts 拆分而来，保持原有逻辑不变。
 */

import crypto from 'crypto';
import { appRedis } from '../config/redis.js';
import { getUserById } from '../services/userService.js';
import { logger } from '../utils/logger.js';
import { type TenantContext, hashUserId } from './authTypes.js';
import { generateToken } from './jwtSigner.js';
import {
  REFRESH_TOKEN_EXPIRES_IN_SEC,
  type RefreshTokenEntry,
  type TokenFamilyEntry,
  REFRESH_TOKEN_PREFIX,
  TOKEN_FAMILY_PREFIX,
  USER_FAMILIES_PREFIX,
  USER_REVOKED_PREFIX,
  isRedisAvailable,
  markRedisUnavailable,
  tenantFromEntry,
  fallbackRefreshTokenStore,
  fallbackTokenFamilyStore,
  fallbackUserFamilies,
  fallbackUserRevokedAt,
} from './tokenStore.js';

/** 非数据库用户（跳过 is_active 校验） */
const SYSTEM_USER_IDS = new Set(['dev-user', 'api-key-user']);

/**
 * 校验数据库用户是否仍可认证（账户停用/匿名化后拒绝 JWT 与 refresh）。
 *
 * @param userId - JWT sub 或 refresh token 中的 userId
 * @returns 系统占位用户恒为 true；数据库用户须存在且 is_active
 */
export async function isUserSessionValid(userId: string): Promise<boolean> {
  if (SYSTEM_USER_IDS.has(userId)) return true;
  try {
    const user = await getUserById(userId);
    return user !== null && user.isActive;
  } catch (err) {
    logger.warn({ err: String(err), userId }, '[jwtAuth] 用户状态查询失败，拒绝会话');
    return false;
  }
}

/**
 * 生成 Refresh Token 并存储
 */
export async function generateRefreshToken(
  userId: string,
  role: 'admin' | 'analyst' | 'readonly',
  existingFamilyId?: string,
  tenant?: TenantContext,
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const familyId = existingFamilyId || crypto.randomBytes(16).toString('hex');
  const ttlSec = REFRESH_TOKEN_EXPIRES_IN_SEC;

  const entry: RefreshTokenEntry = {
    userId,
    role,
    expiresAt: now + ttlSec,
    familyId,
    tenantId: tenant?.tenantId,
    orgRole: tenant?.orgRole,
    platformAdmin: tenant?.platformAdmin,
  };

  const redisOk = await isRedisAvailable();

  if (redisOk) {
    try {
      await appRedis.set(`${REFRESH_TOKEN_PREFIX}${token}`, JSON.stringify(entry), 'EX', ttlSec);

      const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
      await appRedis.set(
        familyKey,
        JSON.stringify({ lastToken: token, revoked: false } satisfies TokenFamilyEntry),
        'EX',
        ttlSec,
      );

      const userFamiliesKey = `${USER_FAMILIES_PREFIX}${userId}`;
      await appRedis.sadd(userFamiliesKey, familyId);
      await appRedis.expire(userFamiliesKey, ttlSec);

      logger.info({ userId, familyId }, '[jwtAuth] Redis: Refresh Token 已存储');
    } catch (err) {
      logger.warn({ err: String(err) }, '[jwtAuth] Redis 存储失败，回退到内存');
      markRedisUnavailable();
      fallbackRefreshTokenStore.set(token, entry);
      fallbackTokenFamilyStore.set(familyId, { lastToken: token, revoked: false });
      trackUserFamilyMemory(userId, familyId);
    }
  } else {
    fallbackRefreshTokenStore.set(token, entry);
    fallbackTokenFamilyStore.set(familyId, { lastToken: token, revoked: false });
    trackUserFamilyMemory(userId, familyId);
  }

  return token;
}

function trackUserFamilyMemory(userId: string, familyId: string): void {
  const families = fallbackUserFamilies.get(userId) ?? new Set<string>();
  families.add(familyId);
  fallbackUserFamilies.set(userId, families);
}

/**
 * 使用 Refresh Token 换取新的 Access Token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const redisOk = await isRedisAvailable();

  if (redisOk) {
    return refreshAccessTokenRedis(refreshToken);
  } else {
    return refreshAccessTokenMemory(refreshToken);
  }
}

/**
 * Redis 模式：Refresh Token 刷新 + Token Family 复用检测
 */
async function refreshAccessTokenRedis(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  try {
    const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
    const raw = await appRedis.get(tokenKey);

    if (!raw) {
      return await checkReuseAndRevoke(refreshToken);
    }

    const entry: RefreshTokenEntry = JSON.parse(raw);

    const now = Math.floor(Date.now() / 1000);
    if (entry.expiresAt < now) {
      await appRedis.del(tokenKey);
      return null;
    }

    if (!(await isUserSessionValid(entry.userId))) {
      await appRedis.del(tokenKey);
      logger.warn({ userId: hashUserId(entry.userId) }, '[jwtAuth] 用户已停用，拒绝 refresh');
      return null;
    }

    const familyKey = `${TOKEN_FAMILY_PREFIX}${entry.familyId}`;
    const familyRaw = await appRedis.get(familyKey);
    if (familyRaw) {
      const family: TokenFamilyEntry = JSON.parse(familyRaw);
      if (family.revoked) {
        logger.warn(
          { familyId: entry.familyId },
          '[jwtAuth] Token family 已被撤销（复用检测触发），拒绝刷新',
        );
        await appRedis.del(tokenKey);
        return null;
      }
    }

    const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
    await appRedis.set(
      usedKey,
      JSON.stringify({ familyId: entry.familyId }),
      'EX',
      REFRESH_TOKEN_EXPIRES_IN_SEC,
    );
    await appRedis.del(tokenKey);

    const tenant = tenantFromEntry(entry);
    const accessToken = await generateToken(entry.userId, entry.role, tenant);
    const newRefreshToken = await generateRefreshToken(
      entry.userId,
      entry.role,
      entry.familyId,
      tenant,
    );

    return { accessToken, refreshToken: newRefreshToken };
  } catch (err) {
    logger.warn({ err: String(err) }, '[jwtAuth] Redis 刷新操作异常，回退到内存模式');
    markRedisUnavailable();
    return refreshAccessTokenMemory(refreshToken);
  }
}

/**
 * 复用检测：当 token 不在 Redis 中时，检查是否为已使用的旧 token
 */
async function checkReuseAndRevoke(refreshToken: string): Promise<null> {
  const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
  const usedRaw = await appRedis.get(usedKey);

  if (usedRaw) {
    const { familyId } = JSON.parse(usedRaw) as { familyId: string };
    logger.warn({ familyId }, '[jwtAuth] 检测到 Refresh Token 复用！撤销整个 Token Family');

    const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
    await appRedis.set(
      familyKey,
      JSON.stringify({ lastToken: '', revoked: true }),
      'EX',
      REFRESH_TOKEN_EXPIRES_IN_SEC,
    );

    const familyRaw = await appRedis.get(familyKey);
    if (familyRaw) {
      const family: TokenFamilyEntry = JSON.parse(familyRaw);
      if (family.lastToken) {
        await appRedis.del(`${REFRESH_TOKEN_PREFIX}${family.lastToken}`);
      }
    }

    return null;
  }

  return null;
}

/**
 * 内存回退模式：Refresh Token 刷新 + Token Family 复用检测
 */
async function refreshAccessTokenMemory(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const usedEntry = fallbackRefreshTokenStore.get(`used:${refreshToken}`);
  if (usedEntry) {
    logger.warn(
      { familyId: usedEntry.familyId },
      '[jwtAuth] 内存模式：检测到 Refresh Token 复用！撤销整个 Token Family',
    );
    const family = fallbackTokenFamilyStore.get(usedEntry.familyId);
    if (family) {
      if (family.lastToken) {
        fallbackRefreshTokenStore.delete(family.lastToken);
      }
      family.revoked = true;
    }
    fallbackRefreshTokenStore.delete(`used:${refreshToken}`);
    return null;
  }

  const entry = fallbackRefreshTokenStore.get(refreshToken);
  if (!entry) return null;

  const now = Math.floor(Date.now() / 1000);
  if (entry.expiresAt < now) {
    fallbackRefreshTokenStore.delete(refreshToken);
    return null;
  }

  if (!(await isUserSessionValid(entry.userId))) {
    fallbackRefreshTokenStore.delete(refreshToken);
    logger.warn(
      { userId: hashUserId(entry.userId) },
      '[jwtAuth] 内存模式：用户已停用，拒绝 refresh',
    );
    return null;
  }

  const family = fallbackTokenFamilyStore.get(entry.familyId);
  if (family?.revoked) {
    logger.warn(
      { familyId: entry.familyId },
      '[jwtAuth] 内存模式：Token family 已被撤销，拒绝刷新',
    );
    fallbackRefreshTokenStore.delete(refreshToken);
    return null;
  }

  fallbackRefreshTokenStore.set(`used:${refreshToken}`, entry);
  fallbackRefreshTokenStore.delete(refreshToken);

  const tenant = tenantFromEntry(entry);
  const accessToken = await generateToken(entry.userId, entry.role, tenant);
  const newRefreshToken = await generateRefreshToken(
    entry.userId,
    entry.role,
    entry.familyId,
    tenant,
  );

  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * 撤销 Refresh Token（登出时调用）
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const redisOk = await isRedisAvailable();

  if (redisOk) {
    try {
      const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
      const raw = await appRedis.get(tokenKey);

      if (raw) {
        const entry: RefreshTokenEntry = JSON.parse(raw);
        const familyKey = `${TOKEN_FAMILY_PREFIX}${entry.familyId}`;
        await appRedis.set(
          familyKey,
          JSON.stringify({ lastToken: '', revoked: true }),
          'EX',
          REFRESH_TOKEN_EXPIRES_IN_SEC,
        );
        await appRedis.del(tokenKey);
        logger.info(
          { familyId: entry.familyId },
          '[jwtAuth] Redis: Refresh Token 及其 Family 已撤销',
        );
      }

      const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
      const usedRaw = await appRedis.get(usedKey);
      if (usedRaw) {
        const { familyId } = JSON.parse(usedRaw) as { familyId: string };
        const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
        await appRedis.set(
          familyKey,
          JSON.stringify({ lastToken: '', revoked: true }),
          'EX',
          REFRESH_TOKEN_EXPIRES_IN_SEC,
        );
        await appRedis.del(usedKey);
      }
    } catch (err) {
      logger.warn({ err: String(err) }, '[jwtAuth] Redis 撤销操作异常，回退到内存');
      markRedisUnavailable();
      revokeRefreshTokenMemory(refreshToken);
    }
  } else {
    revokeRefreshTokenMemory(refreshToken);
  }
}

function revokeRefreshTokenMemory(refreshToken: string): void {
  const entry =
    fallbackRefreshTokenStore.get(refreshToken) ||
    fallbackRefreshTokenStore.get(`used:${refreshToken}`);
  if (entry) {
    const family = fallbackTokenFamilyStore.get(entry.familyId);
    if (family) {
      if (family.lastToken) {
        fallbackRefreshTokenStore.delete(family.lastToken);
      }
      family.revoked = true;
    }
  }
  fallbackRefreshTokenStore.delete(refreshToken);
  fallbackRefreshTokenStore.delete(`used:${refreshToken}`);
}

/**
 * 判断 Access Token 是否在用户全局会话撤销之后签发。
 */
export async function isAccessTokenRevokedForUser(
  userId: string,
  tokenIat: number,
): Promise<boolean> {
  const redisOk = await isRedisAvailable();

  if (redisOk) {
    try {
      const raw = await appRedis.get(`${USER_REVOKED_PREFIX}${userId}`);
      if (!raw) return false;
      const revokedAt = Number.parseInt(raw, 10);
      return Number.isFinite(revokedAt) && tokenIat <= revokedAt;
    } catch {
      // 回退内存
    }
  }

  const revokedAt = fallbackUserRevokedAt.get(userId);
  return revokedAt !== undefined && tokenIat <= revokedAt;
}

/**
 * 撤销用户全部会话（Refresh Token 家族 + 现有 Access Token）。
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const revokedAt = Math.floor(Date.now() / 1000);
  const redisOk = await isRedisAvailable();

  if (redisOk) {
    try {
      const familiesKey = `${USER_FAMILIES_PREFIX}${userId}`;
      const familyIds = await appRedis.smembers(familiesKey);
      for (const familyId of familyIds) {
        await revokeTokenFamilyRedis(familyId);
      }
      if (familyIds.length > 0) {
        await appRedis.del(familiesKey);
      }

      await appRedis.set(
        `${USER_REVOKED_PREFIX}${userId}`,
        String(revokedAt),
        'EX',
        REFRESH_TOKEN_EXPIRES_IN_SEC,
      );
      logger.info({ userId, familyCount: familyIds.length }, '[jwtAuth] Redis: 用户全部会话已撤销');
      return;
    } catch (err) {
      logger.warn({ err: String(err), userId }, '[jwtAuth] Redis 批量撤销失败，回退到内存');
    }
  }

  revokeAllUserSessionsMemory(userId, revokedAt);
  logger.info({ userId }, '[jwtAuth] 内存模式：用户全部会话已撤销');
}

async function revokeTokenFamilyRedis(familyId: string): Promise<void> {
  const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
  const familyRaw = await appRedis.get(familyKey);
  if (familyRaw) {
    const family = JSON.parse(familyRaw) as TokenFamilyEntry;
    if (family.lastToken) {
      await appRedis.del(`${REFRESH_TOKEN_PREFIX}${family.lastToken}`);
    }
  }
  await appRedis.set(
    familyKey,
    JSON.stringify({ lastToken: '', revoked: true } satisfies TokenFamilyEntry),
    'EX',
    REFRESH_TOKEN_EXPIRES_IN_SEC,
  );
}

function revokeAllUserSessionsMemory(userId: string, revokedAt: number): void {
  const familyIds = fallbackUserFamilies.get(userId);
  if (familyIds) {
    for (const familyId of familyIds) {
      const family = fallbackTokenFamilyStore.get(familyId);
      if (family) {
        if (family.lastToken) {
          fallbackRefreshTokenStore.delete(family.lastToken);
        }
        family.revoked = true;
      }
    }
    fallbackUserFamilies.delete(userId);
  }

  for (const key of [...fallbackRefreshTokenStore.keys()]) {
    const entry = fallbackRefreshTokenStore.get(key);
    if (entry?.userId === userId) {
      fallbackRefreshTokenStore.delete(key);
    }
  }

  fallbackUserRevokedAt.set(userId, revokedAt);
}
