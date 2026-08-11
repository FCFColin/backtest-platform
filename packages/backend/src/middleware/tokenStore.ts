import crypto from 'crypto';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { RedisUnavailableError } from '../utils/errors.js';
import { appRedis, getRedisHealth, markRedisUnhealthy } from '../infrastructure/redisClient.js';
import { requireRedis } from '../utils/redisFallback.js';
import { getUserById } from '../repositories/userRepo.js';
import { getMembership, orgRoleToGlobalRole } from '../application/org/membershipService.js';
import { generateToken, hashUserId } from './jwtAuth.js';
import type { Role, TenantContext } from './jwtAuth.js';
import type { OrgRole } from '@backtest/shared/types/org';

const SYSTEM_USER_IDS = new Set(['dev-user']);
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

interface RefreshTokenEntry {
  userId: string;
  role: Role;
  expiresAt: number;
  familyId: string;
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
}
interface TokenFamilyEntry {
  lastToken: string;
  revoked: boolean;
}

export const ACCESS_TOKEN_EXPIRES_IN_SEC = config.JWT_ACCESS_TTL;
const REFRESH_TOKEN_EXPIRES_IN_SEC = config.JWT_REFRESH_TTL;
const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const TOKEN_FAMILY_PREFIX = 'token_family:';

export const ROLE_TTL: Record<Role, number> = {
  readonly: config.SESSION_IDLE_TIMEOUT_READONLY_SEC,
  analyst: config.SESSION_IDLE_TIMEOUT_ANALYST_SEC,
  admin: 0,
};

export const redisKeys = {
  refreshToken: (token: string) => `${REFRESH_TOKEN_PREFIX}${token}`,
  usedRefreshToken: (token: string) => `${REFRESH_TOKEN_PREFIX}used:${token}`,
  family: (familyId: string) => `${TOKEN_FAMILY_PREFIX}${familyId}`,
  userFamilies: (userId: string) => `user_families:${userId}`,
  userRevoked: (userId: string) => `user_revoked:${userId}`,
  idempotency: (key: string) => `idempotency:${key}`,
};

function tenantFromEntry(entry: RefreshTokenEntry): TenantContext {
  return { tenantId: entry.tenantId, orgRole: entry.orgRole, platformAdmin: entry.platformAdmin };
}

export async function generateRefreshToken(
  userId: string,
  role: Role,
  existingFamilyId?: string,
  tenant?: TenantContext,
): Promise<string> {
  if (!(await getRedisHealth()))
    throw new RedisUnavailableError(`Redis unavailable (generateRefreshToken:${userId})`);
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
  try {
    await appRedis.set(redisKeys.refreshToken(token), JSON.stringify(entry), 'EX', ttlSec);
    await appRedis.set(
      redisKeys.family(familyId),
      JSON.stringify({ lastToken: token, revoked: false } satisfies TokenFamilyEntry),
      'EX',
      ttlSec,
    );
    const userFamiliesKey = redisKeys.userFamilies(userId);
    await appRedis.sadd(userFamiliesKey, familyId);
    await appRedis.expire(userFamiliesKey, ttlSec);
    logger.info({ userId, familyId }, '[jwtAuth] Redis: Refresh Token 已存储');
  } catch (err) {
    logger.warn({ err: String(err) }, '[jwtAuth] Redis 存储失败，抛出 RedisUnavailableError');
    markRedisUnhealthy();
    throw new RedisUnavailableError(`Redis write failed (generateRefreshToken): ${String(err)}`);
  }
  return token;
}

export async function readEntry<T>(key: string): Promise<T | null> {
  const raw = await appRedis.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function revokeFamilyRedis(familyId: string): Promise<void> {
  const family = await readEntry<TokenFamilyEntry>(redisKeys.family(familyId));
  if (family?.lastToken) await appRedis.del(redisKeys.refreshToken(family.lastToken));
  await appRedis.set(
    redisKeys.family(familyId),
    JSON.stringify({ lastToken: '', revoked: true } satisfies TokenFamilyEntry),
    'EX',
    REFRESH_TOKEN_EXPIRES_IN_SEC,
  );
}
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await requireRedis(`revoke:${refreshToken}`, () => revokeRefreshTokenRedis(refreshToken));
}
async function revokeRefreshTokenRedis(refreshToken: string): Promise<void> {
  const tokenKey = redisKeys.refreshToken(refreshToken);
  const entry = await readEntry<RefreshTokenEntry>(tokenKey);
  if (entry) {
    await revokeFamilyRedis(entry.familyId);
    await appRedis.del(tokenKey);
    // 注销同时吊销该用户既有 access token（user_revoked 使 iat 更早的 JWT 失效）
    await appRedis.set(
      redisKeys.userRevoked(entry.userId),
      String(Math.floor(Date.now() / 1000)),
      'EX',
      REFRESH_TOKEN_EXPIRES_IN_SEC,
    );
    logger.info({ familyId: entry.familyId }, '[jwtAuth] Redis: Refresh Token 及其 Family 已撤销');
  }
  const usedKey = redisKeys.usedRefreshToken(refreshToken);
  const used = await readEntry<{ familyId: string }>(usedKey);
  if (used) {
    await revokeFamilyRedis(used.familyId);
    await appRedis.del(usedKey);
  }
}
export async function isAccessTokenRevokedForUser(
  userId: string,
  tokenIat: number,
): Promise<boolean> {
  const key = redisKeys.userRevoked(userId);
  return requireRedis(key, async () => {
    const raw = await appRedis.get(key);
    if (!raw) return false;
    const revokedAt = Number.parseInt(raw, 10);
    return Number.isFinite(revokedAt) && tokenIat <= revokedAt;
  });
}
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const revokedAt = Math.floor(Date.now() / 1000);
  await requireRedis(redisKeys.userRevoked(userId), async () => {
    const familiesKey = redisKeys.userFamilies(userId);
    const familyIds = await appRedis.smembers(familiesKey);
    for (const familyId of familyIds) await revokeFamilyRedis(familyId);
    if (familyIds.length > 0) await appRedis.del(familiesKey);
    await appRedis.set(
      redisKeys.userRevoked(userId),
      String(revokedAt),
      'EX',
      REFRESH_TOKEN_EXPIRES_IN_SEC,
    );
    logger.info({ userId, familyCount: familyIds.length }, '[jwtAuth] Redis: 用户全部会话已撤销');
  });
}
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  return requireRedis(`refresh:${refreshToken}`, () => refreshAccessTokenRedis(refreshToken));
}
async function issueRotatedTokens(
  entry: RefreshTokenEntry,
): Promise<{ accessToken: string; refreshToken: string }> {
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
async function refreshAccessTokenRedis(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const tokenKey = redisKeys.refreshToken(refreshToken);
  // P0: GETDEL 原子认领——并发/重放同一 token 时仅一个请求拿到 entry，其余进入复用检测
  const claimed = await appRedis.getdel(tokenKey);
  if (claimed === null) return checkReuseAndRevoke(refreshToken);
  const entry = JSON.parse(claimed as string) as RefreshTokenEntry;
  const now = Math.floor(Date.now() / 1000);
  if (entry.expiresAt < now) return null;
  if (!(await isUserSessionValid(entry.userId))) {
    logger.warn({ userId: hashUserId(entry.userId) }, '[jwtAuth] 用户已停用，拒绝 refresh');
    return null;
  }
  // 刷新时复核当前成员资格（ADR-032）：已移除/降级/组织停用即时生效，不依赖旧 family 吊销
  if (entry.tenantId) {
    const membership = await getMembership(entry.userId, entry.tenantId);
    if (!membership || membership.orgStatus !== 'active') {
      logger.warn(
        { userId: hashUserId(entry.userId), tenantId: entry.tenantId },
        '[jwtAuth] 成员资格已失效，撤销 refresh family 并拒绝刷新',
      );
      await revokeFamilyRedis(entry.familyId);
      return null;
    }
    entry.role = orgRoleToGlobalRole(membership.role);
    entry.orgRole = membership.role;
  }
  const family = await readEntry<TokenFamilyEntry>(redisKeys.family(entry.familyId));
  if (family?.revoked) {
    logger.warn(
      { familyId: entry.familyId },
      '[jwtAuth] Token family 已被撤销（复用检测触发），拒绝刷新',
    );
    return null;
  }
  const usedKey = redisKeys.usedRefreshToken(refreshToken);
  await appRedis.set(
    usedKey,
    JSON.stringify({ familyId: entry.familyId }),
    'EX',
    REFRESH_TOKEN_EXPIRES_IN_SEC,
  );
  return issueRotatedTokens(entry);
}
async function checkReuseAndRevoke(refreshToken: string): Promise<null> {
  const used = await readEntry<{ familyId: string }>(redisKeys.usedRefreshToken(refreshToken));
  if (!used) return null;
  logger.warn(
    { familyId: used.familyId },
    '[jwtAuth] 检测到 Refresh Token 复用！撤销整个 Token Family',
  );
  await revokeFamilyRedis(used.familyId);
  return null;
}
