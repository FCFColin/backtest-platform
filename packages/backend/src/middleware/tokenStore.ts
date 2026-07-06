import { config } from '../config/index.js';
import { appRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { type OrgRole } from './authTypes.js';

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

/** Redis Key 前缀 */
export const REFRESH_TOKEN_PREFIX = 'refresh_token:';
export const TOKEN_FAMILY_PREFIX = 'token_family:';
export const USER_FAMILIES_PREFIX = 'user_families:';
export const USER_REVOKED_PREFIX = 'user_revoked:';

/** 内存回退存储（Redis 不可用时使用） */
export const fallbackRefreshTokenStore = new Map<string, RefreshTokenEntry>();
export const fallbackTokenFamilyStore = new Map<string, TokenFamilyEntry>();
export const fallbackUserFamilies = new Map<string, Set<string>>();
export const fallbackUserRevokedAt = new Map<string, number>();

/** Redis 是否可用 */
let redisAvailable: boolean | null = null;

export async function isRedisAvailable(): Promise<boolean> {
  if (redisAvailable === true) return true;
  try {
    const result = await appRedis.ping();
    redisAvailable = result === 'PONG';
    return redisAvailable;
  } catch {
    if (redisAvailable !== false) {
      logger.warn('[jwtAuth] Redis 不可用，Refresh Token 回退到内存存储');
    }
    redisAvailable = false;
    return false;
  }
}

appRedis.on('ready', () => {
  redisAvailable = true;
});

appRedis.on('error', () => {
  redisAvailable = false;
});

export function markRedisUnavailable(): void {
  redisAvailable = false;
}

/** 从 refresh token entry 提取多租户上下文 */
export function tenantFromEntry(entry: RefreshTokenEntry): {
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
} {
  return { tenantId: entry.tenantId, orgRole: entry.orgRole, platformAdmin: entry.platformAdmin };
}
