/**
 * Refresh Token 管理模块
 *
 * 职责：Refresh Token 的撤销、用户会话撤销、Access Token 全局会话撤销校验。
 *
 * 共享原语（类型 / Redis 前缀 / 内存回退 store / 生成与校验函数）抽离至
 * authShared.ts，避免与 tokenRotation.ts 形成循环依赖（ADR: 中间件瘦身）。
 * Token 轮换（refresh）逻辑抽离至 tokenRotation.ts。
 * Redis 降级语义统一由 withRedisFallback 提供。
 */

import { appRedis } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { withRedisFallback } from '../utils/redisFallback.js';
import {
  REFRESH_TOKEN_PREFIX,
  TOKEN_FAMILY_PREFIX,
  REFRESH_TOKEN_EXPIRES_IN_SEC,
  fallbackRefreshTokenStore,
  fallbackTokenFamilyStore,
  fallbackUserFamilies,
  type RefreshTokenEntry,
  type TokenFamilyEntry,
} from './authShared.js';

// ---------------------------------------------------------------------------
// 仅本模块内部使用的常量 & 内存回退存储
// ---------------------------------------------------------------------------

const USER_FAMILIES_PREFIX = 'user_families:';
const USER_REVOKED_PREFIX = 'user_revoked:';
const fallbackUserRevokedAt = new Map<string, number>();

// ---------------------------------------------------------------------------
// Re-export：共享原语（保持原 refreshToken.ts 公共 API）
// ---------------------------------------------------------------------------

export { isUserSessionValid, generateRefreshToken } from './authShared.js';

// ---------------------------------------------------------------------------
// 撤销 Refresh Token（登出时调用）
// ---------------------------------------------------------------------------

/** 撤销 Refresh Token（登出时调用） */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await withRedisFallback(
    `revoke:${refreshToken}`,
    () => revokeRefreshTokenRedis(refreshToken),
    () => revokeRefreshTokenMemory(refreshToken),
  );
}

async function revokeRefreshTokenRedis(refreshToken: string): Promise<void> {
  const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
  const raw = await appRedis.get(tokenKey);

  if (raw) {
    const entry: RefreshTokenEntry = JSON.parse(raw);
    await revokeFamilyRedis(entry.familyId);
    await appRedis.del(tokenKey);
    logger.info({ familyId: entry.familyId }, '[jwtAuth] Redis: Refresh Token 及其 Family 已撤销');
  }

  const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
  const usedRaw = await appRedis.get(usedKey);
  if (usedRaw) {
    const { familyId } = JSON.parse(usedRaw) as { familyId: string };
    await revokeFamilyRedis(familyId);
    await appRedis.del(usedKey);
  }
}

async function revokeFamilyRedis(familyId: string): Promise<void> {
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
 * @returns tokenIat 早于或等于撤销时间则返回 true
 */
export async function isAccessTokenRevokedForUser(
  userId: string,
  tokenIat: number,
): Promise<boolean> {
  return withRedisFallback(
    `${USER_REVOKED_PREFIX}${userId}`,
    async () => {
      const raw = await appRedis.get(`${USER_REVOKED_PREFIX}${userId}`);
      if (!raw) return false;
      const revokedAt = Number.parseInt(raw, 10);
      return Number.isFinite(revokedAt) && tokenIat <= revokedAt;
    },
    () => {
      const revokedAt = fallbackUserRevokedAt.get(userId);
      return revokedAt !== undefined && tokenIat <= revokedAt;
    },
  );
}

/** 撤销用户全部会话（Refresh Token 家族 + 现有 Access Token）。 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const revokedAt = Math.floor(Date.now() / 1000);
  await withRedisFallback(
    `revoke-all:${userId}`,
    async () => {
      const familiesKey = `${USER_FAMILIES_PREFIX}${userId}`;
      const familyIds = await appRedis.smembers(familiesKey);
      for (const familyId of familyIds) {
        await revokeFamilyRedis(familyId);
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
    },
    () => {
      revokeAllUserSessionsMemory(userId, revokedAt);
      logger.info({ userId }, '[jwtAuth] 内存模式：用户全部会话已撤销');
    },
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

// ---------------------------------------------------------------------------
// Re-export：Token Rotation 逻辑（抽离至 tokenRotation.ts）
// ---------------------------------------------------------------------------

export { refreshAccessToken } from './tokenRotation.js';
