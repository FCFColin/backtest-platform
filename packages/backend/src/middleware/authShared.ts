/**
 * Auth 中间件共享原语
 *
 * 企业理由：refreshToken.ts 与 tokenRotation.ts 共享 token 存储类型、Redis 前缀、
 * 一组无状态辅助函数。原先两文件互相 import 形成循环依赖
 * （refreshToken.ts re-export tokenRotation.ts，tokenRotation.ts 又
 * 从 refreshToken.ts import 共享符号）。本模块抽出共享层，打破环：
 *
 *   refreshToken.ts ──┐
 *                     ├──> authShared.ts
 *   tokenRotation.ts ──┘
 *
 * ADR-045：删除内存回退 store 与 generateRefreshToken 的 else/catch 内存分支。
 * Redis 故障时由 requireRedis 抛 RedisUnavailableError。
 */

import crypto from 'crypto';
import { config } from '../config/index.js';
import { appRedis, getRedisHealth, markRedisUnhealthy } from '../infrastructure/redisClient.js';
import { getUserById } from '../repositories/userRepo.js';
import { logger } from '../utils/logger.js';
import { RedisUnavailableError } from '../utils/errors.js';
import { type TenantContext, type OrgRole } from './authTypes.js';

// ---------------------------------------------------------------------------
// 配置常量
// ---------------------------------------------------------------------------

/** Refresh Token 有效期（秒，从集中配置读取） */
export const REFRESH_TOKEN_EXPIRES_IN_SEC = config.JWT_REFRESH_TTL;

// ---------------------------------------------------------------------------
// Refresh Token 存储类型
// ---------------------------------------------------------------------------

export interface RefreshTokenEntry {
  userId: string;
  role: 'admin' | 'analyst' | 'readonly';
  expiresAt: number;
  familyId: string;
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
}

export interface TokenFamilyEntry {
  lastToken: string;
  revoked: boolean;
}

// ---------------------------------------------------------------------------
// Redis Key 前缀
// ---------------------------------------------------------------------------

/** Redis Key 前缀 */
export const REFRESH_TOKEN_PREFIX = 'refresh_token:';
export const TOKEN_FAMILY_PREFIX = 'token_family:';

// ---------------------------------------------------------------------------
// Token entry 辅助
// ---------------------------------------------------------------------------

/** 从 refresh token entry 提取多租户上下文 */
export function tenantFromEntry(entry: RefreshTokenEntry): {
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
} {
  return { tenantId: entry.tenantId, orgRole: entry.orgRole, platformAdmin: entry.platformAdmin };
}

// ---------------------------------------------------------------------------
// 会话校验
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Refresh Token 生成
// ---------------------------------------------------------------------------

/**
 * 生成 Refresh Token 并存储到 Redis。
 *
 * ADR-045：Redis 不可用或写入失败时抛 RedisUnavailableError（不再降级到内存）。
 *
 * @param userId - 用户 ID
 * @param role - 用户角色
 * @param existingFamilyId - 复用既有 familyId（轮换场景），否则随机生成
 * @param tenant - 多租户上下文（可选）
 * @returns 生成的 refresh token 字面量
 * @throws {RedisUnavailableError} Redis 不可用或写入失败
 */
export async function generateRefreshToken(
  userId: string,
  role: 'admin' | 'analyst' | 'readonly',
  existingFamilyId?: string,
  tenant?: TenantContext,
): Promise<string> {
  if (!(await getRedisHealth())) {
    throw new RedisUnavailableError(`Redis unavailable (generateRefreshToken:${userId})`);
  }

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
    await appRedis.set(`${REFRESH_TOKEN_PREFIX}${token}`, JSON.stringify(entry), 'EX', ttlSec);

    const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
    await appRedis.set(
      familyKey,
      JSON.stringify({ lastToken: token, revoked: false } satisfies TokenFamilyEntry),
      'EX',
      ttlSec,
    );

    const userFamiliesKey = `user_families:${userId}`;
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
