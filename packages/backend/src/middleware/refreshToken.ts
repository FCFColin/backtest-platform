/**
 * Refresh Token 管理模块
 *
 * 职责：Refresh Token 的撤销、用户会话撤销、Access Token 全局会话撤销校验。
 *
 * 共享原语（类型 / Redis 前缀 / 生成与校验函数）抽离至
 * authShared.ts，避免与 tokenRotation.ts 形成循环依赖（ADR: 中间件瘦身）。
 * Token 轮换（refresh）逻辑抽离至 tokenRotation.ts。
 *
 * ADR-045：Redis 故障时不再降级到内存（跨 Pod 状态不一致），改为抛
 * RedisUnavailableError，路由由 asyncRouteHandler 翻译为 503。
 */

import { appRedis } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { requireRedis } from '../utils/redisFallback.js';
import {
  REFRESH_TOKEN_PREFIX,
  TOKEN_FAMILY_PREFIX,
  REFRESH_TOKEN_EXPIRES_IN_SEC,
  type RefreshTokenEntry,
  type TokenFamilyEntry,
} from './authShared.js';

const USER_FAMILIES_PREFIX = 'user_families:';
const USER_REVOKED_PREFIX = 'user_revoked:';

// ---------------------------------------------------------------------------
// Re-export：共享原语（保持原 refreshToken.ts 公共 API）
// ---------------------------------------------------------------------------

export { isUserSessionValid, generateRefreshToken } from './authShared.js';

// ---------------------------------------------------------------------------
// 撤销 Refresh Token（登出时调用）
// ---------------------------------------------------------------------------

/** 撤销 Refresh Token（登出时调用） */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await requireRedis(`revoke:${refreshToken}`, () => revokeRefreshTokenRedis(refreshToken));
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

/**
 * 判断 Access Token 是否在用户全局会话撤销之后签发。
 * @returns tokenIat 早于或等于撤销时间则返回 true
 */
export async function isAccessTokenRevokedForUser(
  userId: string,
  tokenIat: number,
): Promise<boolean> {
  return requireRedis(`${USER_REVOKED_PREFIX}${userId}`, async () => {
    const raw = await appRedis.get(`${USER_REVOKED_PREFIX}${userId}`);
    if (!raw) return false;
    const revokedAt = Number.parseInt(raw, 10);
    return Number.isFinite(revokedAt) && tokenIat <= revokedAt;
  });
}

/** 撤销用户全部会话（Refresh Token 家族 + 现有 Access Token）。 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const revokedAt = Math.floor(Date.now() / 1000);
  await requireRedis(`revoke-all:${userId}`, async () => {
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
  });
}

// ---------------------------------------------------------------------------
// Re-export：Token Rotation 逻辑（抽离至 tokenRotation.ts）
// ---------------------------------------------------------------------------

export { refreshAccessToken } from './tokenRotation.js';
