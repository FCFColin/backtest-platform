/**
 * API Key 仓储（ADR-033 + P0-04）
 *
 * 企业理由：此前平台仅有单一静态 `ADMIN_API_KEY`——无法区分调用方、无法按租户隔离、
 * 泄露后只能全局轮换（牵连所有用户）。多租户 SaaS 要求每个组织自助创建可吊销的密钥，
 * 用于服务端到服务端集成（CI、自动化回测）。P0-04 进一步将平台 break-glass 密钥
 * 也移入本表（`is_platform_admin=true, org_id=NULL`），统一治理面：可轮换、可吊销、
 * 可限期、可审计最后使用时间。
 *
 * 安全设计：
 * - `key_hash`（sha256）保留为快速等值查找索引（高熵密钥，等值比较无时序侧信道顾虑）。
 * - `key_hash_argon2`（argon2id）为新密钥的实际校验哈希（与密码存储策略对齐，P0-04/T6）。
 *   旧密钥仅有 `key_hash`，verify 路径按 sha256 等值回退直至轮换。
 * - 明文 `bpk_live_<rand>` 只在创建时一次性返回，服务端永不持久化明文。
 * - 吊销为软删除（置 `revoked_at`），保留审计轨迹。
 *
 * 隔离边界：api_keys 属身份/控制平面，未启用 RLS（见 009_tenancy.sql 文件头）——
 * 校验发生在"尚未解析出租户"时（先有密钥才有租户）。本仓储以主连接池直查，
 * 并在按组织的读/写操作中显式以 org_id 收敛。平台密钥（org_id NULL）由独立的
 * 平台管理员函数管理，不经过租户作用域。
 *
 * 本仓储承载 CRUD（创建、列表、吊销、轮换）+ 平台密钥管理 + 陈旧密钥巡检；
 * verify 路径见 infrastructure/apiKeyVerifier.ts。
 */
import crypto from 'crypto';
import { getPool } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { sha256Hex, hashApiKeyArgon2id } from '../utils/crypto.js';

/** 明文密钥前缀（标识环境/用途，便于在日志/告警中识别泄露的密钥形态） */
export const KEY_PREFIX = 'bpk_live_';

/** 用于 UI 展示与定位的前缀长度（含 KEY_PREFIX，不泄露可重建密钥的信息） */
const DISPLAY_PREFIX_LEN = 16;

/** 平台 break-glass 密钥最大有效期（天），等保三级"身份鉴别"要求限期 */
export const PLATFORM_ADMIN_KEY_MAX_TTL_DAYS = 90;

/** API Key 元数据（不含明文与哈希，可安全返回前端） */
interface ApiKeyRecord {
  /** 密钥记录 UUID */
  id: string;
  /** 所属组织（租户）UUID；平台密钥为 null */
  orgId: string | null;
  /** 用户可读的密钥名称 */
  name: string;
  /** 展示用前缀（如 bpk_live_ab12） */
  keyPrefix: string;
  /** 是否平台 break-glass 密钥 */
  isPlatformAdmin: boolean;
  /** 创建者用户 UUID（可空） */
  createdBy: string | null;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 最近一次使用时间（可空） */
  lastUsedAt: string | null;
  /** 吊销时间（null 表示有效） */
  revokedAt: string | null;
  /** 过期时间（null 表示不限；平台密钥必填） */
  expiresAt: string | null;
}

/** 创建结果：包含一次性明文密钥（仅此刻可见） */
interface CreatedApiKey extends ApiKeyRecord {
  /** 明文密钥，仅在创建时返回一次，请妥善保存 */
  plaintext: string;
}

/** 陈旧密钥巡检结果（T5 监控） */
export interface StaleApiKey {
  /** 密钥记录 UUID */
  id: string;
  /** 所属组织 UUID；平台密钥为 null */
  orgId: string | null;
  /** 是否平台 break-glass 密钥 */
  isPlatformAdmin: boolean;
  /** 密钥名称 */
  name: string;
  /** 展示用前缀 */
  keyPrefix: string;
  /** 最近一次使用时间（null 表示从未使用） */
  lastUsedAt: string | null;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
}

function mapRow(row: {
  id: string;
  org_id: string | null;
  name: string;
  key_prefix: string;
  is_platform_admin: boolean;
  created_by: string | null;
  created_at: Date | string;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
  expires_at: Date | string | null;
}): ApiKeyRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    isPlatformAdmin: row.is_platform_admin,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
  };
}

/** 平台密钥 SELECT 列集（不含哈希，可安全返回） */
const PLATFORM_KEY_COLUMNS = `id, org_id, name, key_prefix, is_platform_admin,
  created_by, created_at, last_used_at, revoked_at, expires_at`;

/**
 * 为组织创建一把新的 API Key（argon2id 哈希存储）。
 *
 * @param orgId - 所属组织（租户）UUID
 * @param name - 用户可读的密钥名称
 * @param createdBy - 创建者用户 UUID（可空）
 * @returns 含一次性明文密钥的记录
 * @throws 当数据库写入失败时
 */
export async function createApiKey(
  orgId: string,
  name: string,
  createdBy: string | null,
): Promise<CreatedApiKey> {
  // 32 字节高熵随机 → base64url（约 43 字符）
  const random = crypto.randomBytes(32).toString('base64url');
  const plaintext = `${KEY_PREFIX}${random}`;
  const keyHash = sha256Hex(plaintext);
  const keyHashArgon2 = await hashApiKeyArgon2id(plaintext);
  const keyPrefix = plaintext.slice(0, DISPLAY_PREFIX_LEN);

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO api_keys
       (org_id, name, key_hash, key_hash_argon2, key_prefix, created_by, is_platform_admin)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE)
     RETURNING ${PLATFORM_KEY_COLUMNS}`,
    [orgId, name, keyHash, keyHashArgon2, keyPrefix, createdBy],
  );
  logger.info({ orgId, keyId: rows[0].id, createdBy }, '[apiKeyService] 已创建 API Key');
  return { ...mapRow(rows[0]), plaintext };
}

/**
 * 列出组织下的全部 API Key（含已吊销，用于审计）。
 *
 * @param orgId - 组织（租户）UUID
 * @returns 密钥元数据数组（不含明文/哈希）
 */
export async function listApiKeys(orgId: string): Promise<ApiKeyRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${PLATFORM_KEY_COLUMNS}
       FROM api_keys
      WHERE org_id = $1
      ORDER BY created_at DESC`,
    [orgId],
  );
  return rows.map(mapRow);
}

/**
 * 吊销组织下的某把 API Key（软删除，幂等）。
 *
 * @param orgId - 组织（租户）UUID（防止跨租户吊销）
 * @param keyId - 密钥记录 UUID
 * @returns 是否成功吊销（false 表示不存在/不属于该组织/已吊销）
 */
export async function revokeApiKey(orgId: string, keyId: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE api_keys SET revoked_at = NOW()
      WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL`,
    [keyId, orgId],
  );
  const ok = (rowCount ?? 0) > 0;
  if (ok) logger.info({ orgId, keyId }, '[apiKeyService] 已吊销 API Key');
  return ok;
}

// ---------------------------------------------------------------------------
// 平台 break-glass 密钥管理（P0-04）
// ---------------------------------------------------------------------------

/** 生成新的高熵平台密钥明文（bpk_live_<rand>） */
function generatePlatformKeyPlaintext(): string {
  return `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

/**
 * 插入一条平台 break-glass 密钥记录（argon2id 哈希 + 90 天有效期）。
 *
 * 企业理由：平台 break-glass 密钥不再来自环境变量静态值，而是入库管理，
 * 统一受有效期、轮换、吊销约束。bootstrap 与轮换共用本插入路径。
 *
 * @param plaintext - 明文密钥（bootstrap 来自环境变量；轮换为新生成的随机值）
 * @param name - 密钥名称
 * @param expiresInDays - 有效期（天），上限 PLATFORM_ADMIN_KEY_MAX_TTL_DAYS
 * @param createdBy - 创建者用户 UUID（可空）
 * @returns 含一次性明文密钥的记录
 * @throws 当数据库写入失败或有效期超限时
 */
async function insertPlatformAdminKey(
  plaintext: string,
  name: string,
  expiresInDays: number,
  createdBy: string | null,
): Promise<CreatedApiKey> {
  const ttl = Math.min(expiresInDays, PLATFORM_ADMIN_KEY_MAX_TTL_DAYS);
  const keyHash = sha256Hex(plaintext);
  const keyHashArgon2 = await hashApiKeyArgon2id(plaintext);
  const keyPrefix = plaintext.slice(0, DISPLAY_PREFIX_LEN);

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO api_keys
       (org_id, name, key_hash, key_hash_argon2, key_prefix, created_by,
        is_platform_admin, expires_at)
     VALUES (NULL, $1, $2, $3, $4, $5, TRUE, NOW() + make_interval(days => $6))
     RETURNING ${PLATFORM_KEY_COLUMNS}`,
    [name, keyHash, keyHashArgon2, keyPrefix, createdBy, ttl],
  );
  logger.warn(
    { keyId: rows[0].id, ttlDays: ttl, createdBy },
    '[apiKeyService] 已创建平台 break-glass 密钥',
  );
  return { ...mapRow(rows[0]), plaintext };
}

/**
 * 创建一把新的平台 break-glass 密钥（用于 bootstrap 或管理员手动签发）。
 *
 * @param plaintext - 明文密钥（通常来自环境变量 bootstrap）
 * @param name - 密钥名称
 * @param expiresInDays - 有效期（天），上限 90
 * @param createdBy - 创建者用户 UUID（可空）
 * @returns 含一次性明文密钥的记录
 */
export async function createPlatformAdminKey(
  plaintext: string,
  name: string,
  expiresInDays: number,
  createdBy: string | null,
): Promise<CreatedApiKey> {
  return insertPlatformAdminKey(plaintext, name, expiresInDays, createdBy);
}

/**
 * 轮换平台 break-glass 密钥：吊销旧密钥并签发新密钥（原子事务）。
 *
 * 企业理由（P0-04/T3）：break-glass 密钥须可轮换——泄露或定期轮换时，
 * 旧密钥立即吊销、新密钥一次性返回明文。需要"现有 key 才能轮换"：
 * 调用方须以当前有效的平台密钥通过 x-api-key 鉴权，本函数据其 keyId 吊销旧密钥。
 *
 * @param oldKeyId - 当前用于鉴权的平台密钥记录 UUID
 * @param name - 新密钥名称
 * @param expiresInDays - 新密钥有效期（天），上限 90
 * @param createdBy - 操作者用户 UUID（可空）
 * @returns 含新一次性明文密钥的记录
 * @throws 当旧密钥不存在/非平台密钥/已吊销时抛错（调用方应返回 4xx）
 */
export async function rotatePlatformAdminKey(
  oldKeyId: string,
  name: string,
  expiresInDays: number,
  createdBy: string | null,
): Promise<CreatedApiKey> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 仅当 oldKeyId 是有效的平台密钥时才允许轮换（防越权轮换租户密钥）
    const { rows } = await client.query(
      `SELECT id FROM api_keys
        WHERE id = $1 AND is_platform_admin = TRUE AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        FOR UPDATE`,
      [oldKeyId],
    );
    if (rows.length === 0) {
      throw new Error('PLATFORM_ADMIN_KEY_NOT_FOUND');
    }
    await client.query('UPDATE api_keys SET revoked_at = NOW() WHERE id = $1', [oldKeyId]);

    const plaintext = generatePlatformKeyPlaintext();
    const keyHash = sha256Hex(plaintext);
    const keyHashArgon2 = await hashApiKeyArgon2id(plaintext);
    const keyPrefix = plaintext.slice(0, DISPLAY_PREFIX_LEN);
    const ttl = Math.min(expiresInDays, PLATFORM_ADMIN_KEY_MAX_TTL_DAYS);
    const insertRes = await client.query(
      `INSERT INTO api_keys
         (org_id, name, key_hash, key_hash_argon2, key_prefix, created_by,
          is_platform_admin, expires_at)
       VALUES (NULL, $1, $2, $3, $4, $5, TRUE, NOW() + make_interval(days => $6))
       RETURNING ${PLATFORM_KEY_COLUMNS}`,
      [name, keyHash, keyHashArgon2, keyPrefix, createdBy, ttl],
    );
    await client.query('COMMIT');
    logger.warn(
      { oldKeyId, newKeyId: insertRes.rows[0].id, createdBy },
      '[apiKeyService] 已轮换平台 break-glass 密钥',
    );
    return { ...mapRow(insertRes.rows[0]), plaintext };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 列出全部平台 break-glass 密钥（含已吊销，用于审计）。
 *
 * @returns 平台密钥元数据数组（不含明文/哈希）
 */
export async function listPlatformAdminKeys(): Promise<ApiKeyRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${PLATFORM_KEY_COLUMNS}
       FROM api_keys
      WHERE is_platform_admin = TRUE
      ORDER BY created_at DESC`,
  );
  return rows.map(mapRow);
}

/**
 * 吊销指定的平台 break-glass 密钥（软删除，幂等）。
 *
 * 与 {@link revokeApiKey} 的区别：不按 org_id 收敛（平台密钥 org_id 为 NULL），
 * 仅按 keyId + is_platform_admin 定位，防误吊销租户密钥。
 *
 * @param keyId - 密钥记录 UUID
 * @returns 是否成功吊销（false 表示不存在/非平台密钥/已吊销）
 */
export async function revokePlatformAdminKey(keyId: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE api_keys SET revoked_at = NOW()
      WHERE id = $1 AND is_platform_admin = TRUE AND revoked_at IS NULL`,
    [keyId],
  );
  const ok = (rowCount ?? 0) > 0;
  if (ok) logger.warn({ keyId }, '[apiKeyService] 已吊销平台 break-glass 密钥');
  return ok;
}

/**
 * 统计当前有效的平台 break-glass 密钥数量（bootstrap 判定用）。
 *
 * @returns 有效（未吊销且未过期）的平台密钥数量
 */
export async function countActivePlatformAdminKeys(): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM api_keys
      WHERE is_platform_admin = TRUE AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())`,
  );
  return rows[0]?.cnt ?? 0;
}

/**
 * 巡检陈旧密钥：超过阈值天数未使用的有效密钥（T5 监控）。
 *
 * 企业理由：长期未使用的密钥是泄露盲区——攻击者可能持有泄露密钥而长期不被察觉。
 * 平台密钥超过 7 天未用即应告警（break-glass 应为应急偶发使用）。
 *
 * @param thresholdDays - 未使用阈值天数（平台密钥默认 7）
 * @returns 陈旧密钥列表（不含哈希/明文）
 */
export async function findStaleApiKeys(thresholdDays: number): Promise<StaleApiKey[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, org_id, is_platform_admin, name, key_prefix, last_used_at, created_at
       FROM api_keys
      WHERE revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (last_used_at IS NULL OR last_used_at < NOW() - make_interval(days => $1))`,
    [thresholdDays],
  );
  return rows.map(
    (r: {
      id: string;
      org_id: string | null;
      is_platform_admin: boolean;
      name: string;
      key_prefix: string;
      last_used_at: Date | string | null;
      created_at: Date | string;
    }) => ({
      id: r.id,
      orgId: r.org_id,
      isPlatformAdmin: r.is_platform_admin,
      name: r.name,
      keyPrefix: r.key_prefix,
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    }),
  );
}
