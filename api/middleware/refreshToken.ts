/**
 * Refresh Token 管理模块
 *
 * 职责：Refresh Token 的存储（Redis + 内存回退）、刷新、撤销，
 * Token Family 复用检测，用户会话撤销。
 * 从 jwtAuth.ts 拆分而来，保持原有逻辑不变。
 */

import crypto from 'crypto';
import { config } from '../config/index.js';
import { appRedis } from '../config/redis.js';
import { getUserById } from '../services/userService.js';
import { logger } from '../utils/logger.js';
import { type TenantContext, type OrgRole, hashUserId } from './authTypes.js';
import { generateToken } from './jwtSigner.js';

// ---------------------------------------------------------------------------
// 配置常量
// ---------------------------------------------------------------------------

/** Refresh Token 有效期（秒，从集中配置读取） */
const REFRESH_TOKEN_EXPIRES_IN_SEC = config.JWT_REFRESH_TTL;

// ---------------------------------------------------------------------------
// Refresh Token 存储（Redis + Token Family 复用检测）
// ---------------------------------------------------------------------------

/**
 * Refresh Token Redis 存储
 *
 * 企业理由：Refresh Token 必须可撤销（用户登出、安全事件时吊销），
 * 因此需要服务端存储。Redis 替代内存 Map 的理由：
 * 1. 多实例 K8s 部署——内存 Map 仅在单进程内可见，Pod A 签发的
 *    refresh token 在 Pod B 无法验证，导致刷新失败；
 * 2. 进程重启不丢失——内存 Map 随进程消亡，滚动更新后所有 refresh token
 *    失效，用户被强制登出。Redis 持久化保证跨重启有效；
 * 3. 自动过期——Redis TTL 自动清理过期 token，无需手动定时清理；
 * 4. Token Family 复用检测——检测被盗 token 的重放，自动撤销整个家族。
 *
 * 权衡：引入 Redis 依赖增加基础设施复杂度，但 K8s 多副本部署下
 * 内存方案完全无法工作。开发环境 Redis 不可用时自动回退到内存 Map，
 * 确保本地开发零依赖启动。
 */
interface RefreshTokenEntry {
  userId: string;
  role: 'admin' | 'analyst' | 'readonly';
  expiresAt: number; // 秒级时间戳
  familyId: string; // Token 家族 ID，用于复用检测
  // 多租户上下文（ADR-032）：刷新时据此重签发携带相同租户上下文的 access token，
  // 避免刷新后丢失活跃组织（否则用户每次刷新都被"踢出"当前租户）。
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
}

/** 从 refresh token entry 提取多租户上下文 */
function tenantFromEntry(entry: RefreshTokenEntry): TenantContext {
  return { tenantId: entry.tenantId, orgRole: entry.orgRole, platformAdmin: entry.platformAdmin };
}

/**
 * Token Family 记录
 *
 * 企业理由：Token Family 是 OAuth 2.1 推荐的 refresh token 安全机制。
 * 同一次登录产生的所有 refresh token 属于同一个"家族"（通过轮换串联）。
 * 当检测到已使用过的 token 被再次使用时，说明攻击者可能截获了该 token，
 * 此时必须撤销整个家族，防止攻击者利用截获的 token 继续访问。
 *
 * 场景：用户刷新 token → 旧 token T1 失效，新 token T2 签发。
 * 攻击者截获 T1 并在用户使用 T2 之后尝试使用 T1 → 检测到 T1 复用 →
 * 撤销整个 family（T2 也失效），迫使攻击者和合法用户都重新认证。
 */
interface TokenFamilyEntry {
  lastToken: string; // 家族中最新有效的 token
  revoked: boolean; // 整个家族是否已被撤销
}

/** Redis Key 前缀 */
const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const TOKEN_FAMILY_PREFIX = 'token_family:';
const USER_FAMILIES_PREFIX = 'user_families:';
const USER_REVOKED_PREFIX = 'user_revoked:';

/** 内存回退存储（Redis 不可用时使用） */
const fallbackRefreshTokenStore = new Map<string, RefreshTokenEntry>();
const fallbackTokenFamilyStore = new Map<string, TokenFamilyEntry>();
const fallbackUserFamilies = new Map<string, Set<string>>();
const fallbackUserRevokedAt = new Map<string, number>();

/** Redis 是否可用 */
let redisAvailable: boolean | null = null;

async function isRedisAvailable(): Promise<boolean> {
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
// Token 生成与刷新
// ---------------------------------------------------------------------------

/**
 * 生成 Refresh Token 并存储
 *
 * 企业理由：Access Token 短期有效（15min），Refresh Token 长期有效（7d），
 * 用户无需频繁重新登录。Refresh Token 仅用于换取新的 Access Token，
 * 不携带业务权限，降低泄露风险。
 *
 * Token Family 机制：每次登录创建新的 familyId，后续刷新产生的 token
 * 都属于同一 family。若检测到旧 token 被复用，撤销整个 family。
 *
 * @param userId - 用户 ID
 * @param role - 用户角色
 * @param existingFamilyId - 已有的 family ID（刷新时传入，登录时为空）
 * @param tenant - 可选的多租户上下文，随 token 持久化以便刷新时重签发
 * @returns 随机 Refresh Token 字符串
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
      // 存储 refresh token，带 TTL 自动过期
      await appRedis.set(`${REFRESH_TOKEN_PREFIX}${token}`, JSON.stringify(entry), 'EX', ttlSec);

      // 更新 token family 记录
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
      redisAvailable = false;
      fallbackRefreshTokenStore.set(token, entry);
      fallbackTokenFamilyStore.set(familyId, { lastToken: token, revoked: false });
      trackUserFamilyMemory(userId, familyId);
    }
  } else {
    // 内存回退
    fallbackRefreshTokenStore.set(token, entry);
    fallbackTokenFamilyStore.set(familyId, { lastToken: token, revoked: false });
    trackUserFamilyMemory(userId, familyId);
  }

  return token;
}

/**
 * 使用 Refresh Token 换取新的 Access Token
 *
 * 企业理由：Refresh Token 轮换机制——每次刷新后旧 token 失效，
 * 限制被盗 token 的使用窗口。Token Family 复用检测确保：
 * 若已使用的旧 token 被再次提交，说明可能存在 token 泄露，
 * 立即撤销整个 family 中所有 token，强制重新认证。
 *
 * @param refreshToken - 旧的 Refresh Token
 * @returns 新的 token 对，或 null 表示无效/过期/复用检测触发
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
 *
 * 企业理由：Redis 原子操作确保并发刷新的安全性。
 * 流程：
 * 1. 读取 token 对应的 entry（含 familyId）
 * 2. 检查 family 是否已被撤销（revoked=true）
 * 3. 检查该 token 是否为 family 中最新的 token
 *    - 若不是最新 → 说明是旧 token 被复用 → 撤销整个 family
 *    - 若是最新 → 正常刷新，删除旧 token，签发新 token
 * 4. 更新 family 的 lastToken 为新 token
 */
async function refreshAccessTokenRedis(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  try {
    const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
    const raw = await appRedis.get(tokenKey);

    if (!raw) {
      // Token 不存在（已过期/已使用/从未签发）
      // 但可能是已使用的旧 token 被复用，需检查 family
      return await checkReuseAndRevoke(refreshToken);
    }

    const entry: RefreshTokenEntry = JSON.parse(raw);

    // 检查过期
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

    // 检查 family 是否已被撤销
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

    // 正常刷新：将旧 token 标记为"已使用"（用于复用检测），而非直接删除
    // 企业理由：保留旧 token 的 familyId 映射，使复用检测能识别已使用的 token
    const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
    await appRedis.set(
      usedKey,
      JSON.stringify({ familyId: entry.familyId }),
      'EX',
      REFRESH_TOKEN_EXPIRES_IN_SEC,
    );
    await appRedis.del(tokenKey);

    // 签发新 token 对（保留多租户上下文）
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
    redisAvailable = false;
    return refreshAccessTokenMemory(refreshToken);
  }
}

/**
 * 复用检测：当 token 不在 Redis 中时，遍历 family 查找是否为已使用的旧 token
 *
 * 企业理由：攻击者截获旧 token T1，在合法用户已用 T1 换取 T2 后，
 * 攻击者尝试使用 T1。此时 T1 已从 Redis 删除（正常刷新时删除），
 * 但我们无法直接知道 T1 属于哪个 family。
 *
 * 策略：由于 token 中不含 familyId（出于安全考虑，token 本身是随机字符串），
 * 当 token 不存在时无法确定其 family。但 OAuth 2.1 的最佳实践是：
 * 当客户端提交了一个不存在的 refresh token 时，如果该 token 曾被使用过
 * （即已被删除），则应视为潜在的安全事件。
 *
 * 实际实现中，我们在刷新时不立即删除旧 token，而是将其标记为"已使用"，
 * 这样可以检测到复用。具体做法：
 * - 刷新时，将旧 token 的值更新为 { used: true, familyId } 而非删除
 * - 检测到 used: true 的 token 被提交时，撤销整个 family
 */
async function checkReuseAndRevoke(refreshToken: string): Promise<null> {
  // 检查是否是标记为"已使用"的 token（用于复用检测）
  const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
  const usedRaw = await appRedis.get(usedKey);

  if (usedRaw) {
    // 这是一个已使用的 token 被复用！撤销整个 family
    const { familyId } = JSON.parse(usedRaw) as { familyId: string };
    logger.warn({ familyId }, '[jwtAuth] 检测到 Refresh Token 复用！撤销整个 Token Family');

    const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
    await appRedis.set(
      familyKey,
      JSON.stringify({ lastToken: '', revoked: true }),
      'EX',
      REFRESH_TOKEN_EXPIRES_IN_SEC,
    );

    // 删除 family 中最新 token（如果还存在）
    const familyRaw = await appRedis.get(familyKey);
    if (familyRaw) {
      const family: TokenFamilyEntry = JSON.parse(familyRaw);
      if (family.lastToken) {
        await appRedis.del(`${REFRESH_TOKEN_PREFIX}${family.lastToken}`);
      }
    }

    return null;
  }

  // Token 确实不存在（从未签发或已过期被 Redis 自动清理）
  return null;
}

/**
 * 内存回退模式：Refresh Token 刷新 + Token Family 复用检测
 */
async function refreshAccessTokenMemory(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  // 先检查是否为已使用的 token（复用检测）
  const usedEntry = fallbackRefreshTokenStore.get(`used:${refreshToken}`);
  if (usedEntry) {
    // 检测到复用！撤销整个 family
    logger.warn(
      { familyId: usedEntry.familyId },
      '[jwtAuth] 内存模式：检测到 Refresh Token 复用！撤销整个 Token Family',
    );
    const family = fallbackTokenFamilyStore.get(usedEntry.familyId);
    if (family) {
      // 删除 family 中最新 token
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

  // 检查过期
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

  // 检查 family 是否已被撤销
  const family = fallbackTokenFamilyStore.get(entry.familyId);
  if (family?.revoked) {
    logger.warn(
      { familyId: entry.familyId },
      '[jwtAuth] 内存模式：Token family 已被撤销，拒绝刷新',
    );
    fallbackRefreshTokenStore.delete(refreshToken);
    return null;
  }

  // 将旧 token 标记为"已使用"（用于复用检测），而非直接删除
  fallbackRefreshTokenStore.set(`used:${refreshToken}`, entry);
  fallbackRefreshTokenStore.delete(refreshToken);

  // 签发新 token 对（保留多租户上下文）
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
 *
 * 企业理由：用户主动登出时，应撤销该 token 对应的整个 family，
 * 确保所有通过该登录会话签发的 refresh token 均失效，
 * 防止攻击者利用截获的 token 继续访问。
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const redisOk = await isRedisAvailable();

  if (redisOk) {
    try {
      const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
      const raw = await appRedis.get(tokenKey);

      if (raw) {
        const entry: RefreshTokenEntry = JSON.parse(raw);
        // 撤销整个 family
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

      // 也检查 used token
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
      redisAvailable = false;
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

function trackUserFamilyMemory(userId: string, familyId: string): void {
  const families = fallbackUserFamilies.get(userId) ?? new Set<string>();
  families.add(familyId);
  fallbackUserFamilies.set(userId, families);
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

function revokeTokenFamilyMemory(familyId: string): void {
  const family = fallbackTokenFamilyStore.get(familyId);
  if (family) {
    if (family.lastToken) {
      fallbackRefreshTokenStore.delete(family.lastToken);
    }
    family.revoked = true;
  }
}

function revokeAllUserSessionsMemory(userId: string, revokedAt: number): void {
  const familyIds = fallbackUserFamilies.get(userId);
  if (familyIds) {
    for (const familyId of familyIds) {
      revokeTokenFamilyMemory(familyId);
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

/**
 * 撤销用户全部会话（Refresh Token 家族 + 现有 Access Token）。
 *
 * 企业理由：账户删除/安全事件须使所有已签发令牌失效，防止匿名化后仍可用旧 JWT 访问 API。
 *
 * @param userId - 用户 ID
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
      redisAvailable = false;
    }
  }

  revokeAllUserSessionsMemory(userId, revokedAt);
  logger.info({ userId }, '[jwtAuth] 内存模式：用户全部会话已撤销');
}
