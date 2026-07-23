/**
 * Token Rotation 逻辑模块
 *
 * 职责：Refresh Token 轮换核心（Redis + 内存回退两条路径），
 * Token Family 复用检测（refresh 去重 via "used:" 标记 + 整族撤销）。
 *
 * 本模块从 refreshToken.ts 抽离，依赖其存储原语与模块级状态。
 * 共享原语现集中至 authShared.ts，避免与 refreshToken.ts 形成循环依赖。
 * Redis 降级语义统一由 withRedisFallback 提供。
 */

import { appRedis } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { withRedisFallback } from '../utils/redisFallback.js';
import { hashUserId } from './authTypes.js';
import {
  type RefreshTokenEntry,
  type TokenFamilyEntry,
  REFRESH_TOKEN_PREFIX,
  TOKEN_FAMILY_PREFIX,
  REFRESH_TOKEN_EXPIRES_IN_SEC,
  fallbackRefreshTokenStore,
  fallbackTokenFamilyStore,
  tenantFromEntry,
  isUserSessionValid,
  generateRefreshToken,
} from './authShared.js';
import { generateToken } from './jwtSigner.js';

/** 使用 Refresh Token 换取新的 Access Token */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  return withRedisFallback(
    `refresh:${refreshToken}`,
    () => refreshAccessTokenRedis(refreshToken),
    () => refreshAccessTokenMemory(refreshToken),
  );
}

/**
 * 从 refresh entry 签发新的 Access Token + Refresh Token（轮换）。
 * Redis 与内存两条刷新路径共用此逻辑，避免重复。
 */
async function issueRotatedTokens(entry: RefreshTokenEntry): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
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
 * Redis 模式：Refresh Token 刷新 + Token Family 复用检测
 */
async function refreshAccessTokenRedis(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
  const raw = await appRedis.get(tokenKey);

  if (!raw) {
    return checkReuseAndRevoke(refreshToken);
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

  return issueRotatedTokens(entry);
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

  return issueRotatedTokens(entry);
}
