/**
 * API Key 仓储（ADR-033 + P0-04）。
 * 多租户 SaaS 每个组织自助创建可吊销的密钥；平台 break-glass 密钥（is_platform_admin=true, org_id=NULL）
 * 也入本表统一治理。安全设计：key_hash（sha256）快速查找 + key_hash_argon2（argon2id）校验；
 * 明文 bpk_live_<rand> 仅创建时一次性返回；吊销为软删除（revoked_at）。
 * 隔离：api_keys 未启用 RLS（校验发生在尚未解析出租户时），按 org_id 显式收敛。
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
  id: string;
  orgId: string | null;
  name: string;
  keyPrefix: string;
  isPlatformAdmin: boolean;
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
}

interface CreatedApiKey extends ApiKeyRecord {
  plaintext: string;
}

export interface StaleApiKey {
  id: string;
  orgId: string | null;
  isPlatformAdmin: boolean;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const PLATFORM_KEY_COLUMNS = `id, org_id, name, key_prefix, is_platform_admin,
  created_by, created_at, last_used_at, revoked_at, expires_at`;

const toIso = (v: Date | string | null): string | null => (v ? new Date(v).toISOString() : null);

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
    lastUsedAt: toIso(row.last_used_at),
    revokedAt: toIso(row.revoked_at),
    expiresAt: toIso(row.expires_at),
  };
}

function generatePlatformKeyPlaintext(): string {
  return `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

/** 从明文密钥派生哈希与展示前缀（sha256 快速查找 + argon2id 校验 + 前缀展示） */
async function deriveKeyFields(plaintext: string) {
  return {
    keyHash: sha256Hex(plaintext),
    keyHashArgon2: await hashApiKeyArgon2id(plaintext),
    keyPrefix: plaintext.slice(0, DISPLAY_PREFIX_LEN),
  };
}

/** 为组织创建一把新的 API Key（argon2id 哈希存储）。 */
export async function createApiKey(orgId: string, name: string, createdBy: string | null): Promise<CreatedApiKey> {
  const plaintext = generatePlatformKeyPlaintext();
  const { keyHash, keyHashArgon2, keyPrefix } = await deriveKeyFields(plaintext);
  const { rows } = await getPool().query(
    `INSERT INTO api_keys (org_id, name, key_hash, key_hash_argon2, key_prefix, created_by, is_platform_admin)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE)
     RETURNING ${PLATFORM_KEY_COLUMNS}`,
    [orgId, name, keyHash, keyHashArgon2, keyPrefix, createdBy],
  );
  logger.info({ orgId, keyId: rows[0].id, createdBy }, '[apiKeyService] 已创建 API Key');
  return { ...mapRow(rows[0]), plaintext };
}

/** 列出组织下的全部 API Key（含已吊销，用于审计）。 */
export async function listApiKeys(orgId: string): Promise<ApiKeyRecord[]> {
  const { rows } = await getPool().query(
    `SELECT ${PLATFORM_KEY_COLUMNS} FROM api_keys WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId],
  );
  return rows.map(mapRow);
}

/** 吊销组织下的某把 API Key（软删除，幂等）。返回 false 表示不存在/不属于该组织/已吊销。 */
export async function revokeApiKey(orgId: string, keyId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL`,
    [keyId, orgId],
  );
  const ok = (rowCount ?? 0) > 0;
  if (ok) logger.info({ orgId, keyId }, '[apiKeyService] 已吊销 API Key');
  return ok;
}

// 平台 break-glass 密钥管理（P0-04）

/**
 * 插入一条平台 break-glass 密钥记录（argon2id 哈希 + 90 天有效期）。
 * 平台密钥不再来自环境变量静态值，而是入库管理，统一受有效期、轮换、吊销约束。
 */
async function insertPlatformAdminKey(
  plaintext: string,
  name: string,
  expiresInDays: number,
  createdBy: string | null,
): Promise<CreatedApiKey> {
  const ttl = Math.min(expiresInDays, PLATFORM_ADMIN_KEY_MAX_TTL_DAYS);
  const { keyHash, keyHashArgon2, keyPrefix } = await deriveKeyFields(plaintext);
  const { rows } = await getPool().query(
    `INSERT INTO api_keys
       (org_id, name, key_hash, key_hash_argon2, key_prefix, created_by,
        is_platform_admin, expires_at)
     VALUES (NULL, $1, $2, $3, $4, $5, TRUE, NOW() + make_interval(days => $6))
     RETURNING ${PLATFORM_KEY_COLUMNS}`,
    [name, keyHash, keyHashArgon2, keyPrefix, createdBy, ttl],
  );
  logger.warn({ keyId: rows[0].id, ttlDays: ttl, createdBy }, '[apiKeyService] 已创建平台 break-glass 密钥');
  return { ...mapRow(rows[0]), plaintext };
}

/** 创建一把新的平台 break-glass 密钥（用于 bootstrap 或管理员手动签发）。 */
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
 * 调用方须以当前有效的平台密钥通过 x-api-key 鉴权，本函数据其 keyId 吊销旧密钥。
 * 旧密钥不存在/非平台密钥/已吊销时抛错（调用方应返回 4xx）。
 */
export async function rotatePlatformAdminKey(
  oldKeyId: string,
  name: string,
  expiresInDays: number,
  createdBy: string | null,
): Promise<CreatedApiKey> {
  const client = await getPool().connect();
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
    const { keyHash, keyHashArgon2, keyPrefix } = await deriveKeyFields(plaintext);
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

/** 列出全部平台 break-glass 密钥（含已吊销，用于审计）。 */
export async function listPlatformAdminKeys(): Promise<ApiKeyRecord[]> {
  const { rows } = await getPool().query(
    `SELECT ${PLATFORM_KEY_COLUMNS} FROM api_keys WHERE is_platform_admin = TRUE ORDER BY created_at DESC`,
  );
  return rows.map(mapRow);
}

/**
 * 吊销指定的平台 break-glass 密钥（软删除，幂等）。
 * 与 revokeApiKey 的区别：不按 org_id 收敛（平台密钥 org_id 为 NULL），
 * 仅按 keyId + is_platform_admin 定位，防误吊销租户密钥。
 */
export async function revokePlatformAdminKey(keyId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND is_platform_admin = TRUE AND revoked_at IS NULL`,
    [keyId],
  );
  const ok = (rowCount ?? 0) > 0;
  if (ok) logger.warn({ keyId }, '[apiKeyService] 已吊销平台 break-glass 密钥');
  return ok;
}

/** 统计当前有效的平台 break-glass 密钥数量（bootstrap 判定用）。 */
export async function countActivePlatformAdminKeys(): Promise<number> {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS cnt FROM api_keys
      WHERE is_platform_admin = TRUE AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())`,
  );
  return rows[0]?.cnt ?? 0;
}

/**
 * 巡检陈旧密钥：超过阈值天数未使用的有效密钥（T5 监控）。
 * 长期未使用的密钥是泄露盲区——攻击者可能持有泄露密钥而长期不被察觉。
 * 平台密钥超过 7 天未用即应告警（break-glass 应为应急偶发使用）。
 */
export async function findStaleApiKeys(thresholdDays: number): Promise<StaleApiKey[]> {
  const { rows } = await getPool().query(
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
      lastUsedAt: toIso(r.last_used_at),
      createdAt: new Date(r.created_at).toISOString(),
    }),
  );
}