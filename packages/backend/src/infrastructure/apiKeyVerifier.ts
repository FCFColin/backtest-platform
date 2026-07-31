/**
 * API Key 校验服务（ADR-033 + P0-04）
 *
 * 仅承载 verify 路径：按 sha256 等值查找有效密钥（命中后用 argon2id 校验新密钥），
 * 并异步更新 last_used_at。CRUD（创建、列表、吊销、轮换）见 repositories/apiKeyRepo.ts。
 *
 * 企业理由：x-api-key 鉴权路径据此把请求绑定到组织（租户）与密钥身份，
 * 再交由 RLS 隔离数据。已吊销（revoked_at 非空）或已过期（expires_at 早于 NOW()）
 * 的密钥一律拒绝（P0-04/T4 生命周期校验）。
 *
 * 安全设计：
 * - 校验走 sha256 等值查找（哈希本身高熵，等值比较无时序侧信道顾虑；且 DB 唯一索引命中）。
 * - 新密钥（key_hash_argon2 非空）在等值命中后用 argon2id 常量时间校验（与密码同策略，T6）；
 *   旧密钥（仅有 key_hash）回退到 sha256 等值作为校验，直至轮换为 argon2id。
 * - Redis 吊销缓存（apikey:revoked:{keyId}）作为 DB revoked_at 之外的二次防线，
 *   跨 Pod 立即生效且对读副本复制延迟鲁棒。Redis 不可用时优雅降级：仅依赖 DB
 *   revoked_at（主连接池，权威源）并记录 warning，不阻断鉴权热路径（ADR-045 内存降级
 *   已退役，但鉴权路径抛 503 过于激进——DB 已保证 revoked_at 即时可见）。
 */
import { getPool } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { KEY_PREFIX, PLATFORM_ADMIN_KEY_MAX_TTL_DAYS } from '../repositories/apiKeyRepo.js';
import { sha256Hex, verifyApiKeyArgon2id } from '../utils/crypto.js';
import { appRedis } from '../infrastructure/redisClient.js';
import { requireRedis } from '../utils/redisFallback.js';

/** Redis 吊销缓存 key 前缀 */
const APIKEY_REVOKED_PREFIX = 'apikey:revoked:';

interface VerifiedApiKey {
  /** 所属组织（租户）UUID；平台密钥为 null */
  orgId: string | null;
  keyId: string;
  /** 是否平台 break-glass 密钥（注入 platform_admin 角色） */
  isPlatformAdmin: boolean;
}

interface ApiKeyCandidate {
  id: string;
  org_id: string | null;
  is_platform_admin: boolean;
  key_hash_argon2: string | null;
}

/**
 * 标记 API Key 已吊销（写入 Redis 吊销缓存，立即跨 Pod 生效）。
 *
 * 企业理由（P0-04 Checklist）：Key 泄露时一键吊销需"立即生效"。DB 的 revoked_at
 * 在主连接上即时可见，但读副本复制延迟或跨 Pod 正向缓存可能导致短窗口放行；
 * Redis 吊销缓存作为显式的"立即生效"层，被 verify 路径在 DB 命中后二次校验。
 *
 * Redis 不可用时仅记录 warning——DB revoked_at 已由路由层先行写入（权威源），
 * 吊销仍生效，仅跨 Pod 即时性降级为 DB 复制延迟。
 *
 * @param keyId - 密钥记录 UUID
 */
export async function markApiKeyRevoked(keyId: string): Promise<void> {
  const key = `${APIKEY_REVOKED_PREFIX}${keyId}`;
  try {
    await requireRedis(key, () =>
      appRedis.set(key, '1', 'EX', PLATFORM_ADMIN_KEY_MAX_TTL_DAYS * 24 * 3600),
    );
  } catch (err) {
    logger.warn(
      { err: String(err), keyId },
      '[apiKeyService] Redis 吊销缓存写入失败，已降级为仅 DB revoked_at（跨 Pod 即时性降级）',
    );
  }
}

/**
 * 查询 keyId 是否在 Redis 吊销缓存中（立即生效层）。
 *
 * Redis 不可用时返回 false（视为未在缓存中吊销）——DB 查询已过滤 revoked_at IS NULL
 * （主连接池，权威源），Redis 仅是跨 Pod 即时传播层，缺失不影响鉴权正确性。
 *
 * @param keyId - 密钥记录 UUID
 * @returns true 表示已吊销（应拒绝）
 */
async function isApiKeyRevoked(keyId: string): Promise<boolean> {
  const key = `${APIKEY_REVOKED_PREFIX}${keyId}`;
  try {
    const raw = await requireRedis(key, () => appRedis.get(key));
    return raw === '1';
  } catch (err) {
    logger.warn(
      { err: String(err), keyId },
      '[apiKeyService] Redis 吊销缓存查询失败，降级为仅 DB revoked_at 校验',
    );
    return false;
  }
}

/**
 * 校验明文 API Key，返回其租户/平台上下文并异步更新 last_used_at。
 *
 * 校验链：sha256 等值查找有效密钥（revoked_at IS NULL 且未过期）→
 * Redis 吊销缓存二次校验 → argon2id 校验新密钥（若有）→ 异步更新 last_used_at。
 *
 * @param plaintext - 客户端提供的明文密钥
 * @returns 解析出的 { orgId, keyId, isPlatformAdmin }，无效/已吊销/已过期时返回 null
 */
export async function verifyApiKey(plaintext: string): Promise<VerifiedApiKey | null> {
  if (
    typeof plaintext !== 'string' ||
    !plaintext.startsWith(KEY_PREFIX) ||
    plaintext.length > 128
  ) {
    return null;
  }
  const keyHash = sha256Hex(plaintext);
  const pool = getPool();
  // revoked_at IS NULL + expires_at 校验在 DB 层完成（T4 生命周期检查）
  const { rows } = await pool.query<ApiKeyCandidate>(
    `SELECT id, org_id, is_platform_admin, key_hash_argon2
       FROM api_keys
      WHERE key_hash = $1
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [keyHash],
  );
  if (rows.length === 0) return null;

  const candidate = rows[0];
  const keyId = candidate.id;

  // Redis 吊销缓存二次校验（立即生效层，跨 Pod 一致）
  if (await isApiKeyRevoked(keyId)) {
    logger.warn({ keyId }, '[apiKeyService] 密钥命中 Redis 吊销缓存，拒绝访问');
    return null;
  }

  // 新密钥：argon2id 常量时间校验；旧密钥：sha256 等值命中即视为校验通过
  if (candidate.key_hash_argon2) {
    const ok = await verifyApiKeyArgon2id(candidate.key_hash_argon2, plaintext);
    if (!ok) {
      logger.warn({ keyId }, '[apiKeyService] argon2id 校验失败，拒绝访问');
      return null;
    }
  }

  // 异步更新 last_used_at，不阻塞鉴权热路径；失败仅记录不影响请求。
  pool
    .query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyId])
    .catch((err) =>
      logger.warn({ err: String(err), keyId }, '[apiKeyService] last_used_at 更新失败'),
    );

  return {
    orgId: candidate.org_id,
    keyId,
    isPlatformAdmin: candidate.is_platform_admin,
  };
}