/**
 * 按组织（租户）的 API Key 服务（ADR-033）
 *
 * 企业理由：此前平台仅有单一静态 `ADMIN_API_KEY`——无法区分调用方、无法按租户隔离、
 * 泄露后只能全局轮换（牵连所有用户）。多租户 SaaS 要求每个组织自助创建可吊销的密钥，
 * 用于服务端到服务端集成（CI、自动化回测）。
 *
 * 安全设计：
 * - 仅存储密钥的 sha256 哈希（`key_hash`），明文 `bpk_live_<rand>` 只在创建时一次性返回，
 *   服务端永不持久化明文（与密码存储同理——泄库不致泄密）。
 * - `key_prefix` 存储明文前若干位用于 UI 定位/展示，不含可重建密钥的信息。
 * - 校验走 sha256 等值查找（哈希本身高熵，等值比较无时序侧信道顾虑；且 DB 唯一索引命中）。
 * - 吊销为软删除（置 `revoked_at`），保留审计轨迹。
 *
 * 隔离边界：api_keys 属身份/控制平面，未启用 RLS（见 009_tenancy.sql 文件头）——
 * 校验发生在"尚未解析出租户"时（先有密钥才有租户）。本服务以主连接池直查，
 * 并在按组织的读/写操作中显式以 org_id 收敛。
 */
import crypto from 'crypto';
import { getPool } from '../db/index.js';
import { logger } from '../utils/logger.js';

/** 明文密钥前缀（标识环境/用途，便于在日志/告警中识别泄露的密钥形态） */
const KEY_PREFIX = 'bpk_live_';

/** 用于 UI 展示与定位的前缀长度（含 KEY_PREFIX，不泄露可重建密钥的信息） */
const DISPLAY_PREFIX_LEN = 16;

/** API Key 元数据（不含明文与哈希，可安全返回前端） */
export interface ApiKeyRecord {
  /** 密钥记录 UUID */
  id: string;
  /** 所属组织（租户）UUID */
  orgId: string;
  /** 用户可读的密钥名称 */
  name: string;
  /** 展示用前缀（如 bpk_live_ab12） */
  keyPrefix: string;
  /** 创建者用户 UUID（可空） */
  createdBy: string | null;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 最近一次使用时间（可空） */
  lastUsedAt: string | null;
  /** 吊销时间（null 表示有效） */
  revokedAt: string | null;
}

/** 创建结果：包含一次性明文密钥（仅此刻可见） */
export interface CreatedApiKey extends ApiKeyRecord {
  /** 明文密钥，仅在创建时返回一次，请妥善保存 */
  plaintext: string;
}

/** 校验通过后解析出的租户上下文 */
export interface VerifiedApiKey {
  /** 所属组织（租户）UUID */
  orgId: string;
  /** 密钥记录 UUID */
  keyId: string;
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}

function mapRow(row: {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  created_by: string | null;
  created_at: Date | string;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
}): ApiKeyRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  };
}

/**
 * 为组织创建一把新的 API Key。
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
  const keyPrefix = plaintext.slice(0, DISPLAY_PREFIX_LEN);

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO api_keys (org_id, name, key_hash, key_prefix, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, org_id, name, key_prefix, created_by, created_at, last_used_at, revoked_at`,
    [orgId, name, keyHash, keyPrefix, createdBy],
  );
  logger.info({ orgId, keyId: rows[0].id, createdBy }, '[apiKeyService] 已创建 API Key');
  return { ...mapRow(rows[0]), plaintext };
}

/**
 * 校验明文 API Key，返回其租户上下文并异步更新 last_used_at。
 *
 * 企业理由：x-api-key 鉴权路径据此把请求绑定到组织（租户）与密钥身份，
 * 再交由 RLS 隔离数据。已吊销（revoked_at 非空）的密钥一律拒绝。
 *
 * @param plaintext - 客户端提供的明文密钥
 * @returns 解析出的 { orgId, keyId }，无效/已吊销时返回 null
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
  const { rows } = await pool.query(
    `SELECT id, org_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
    [keyHash],
  );
  if (rows.length === 0) return null;

  const keyId = rows[0].id as string;
  const orgId = rows[0].org_id as string;
  // 异步更新 last_used_at，不阻塞鉴权热路径；失败仅记录不影响请求。
  pool
    .query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyId])
    .catch((err) =>
      logger.warn({ err: String(err), keyId }, '[apiKeyService] last_used_at 更新失败'),
    );

  return { orgId, keyId };
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
    `SELECT id, org_id, name, key_prefix, created_by, created_at, last_used_at, revoked_at
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
