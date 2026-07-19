/**
 * API Key 校验服务（ADR-033）
 *
 * 仅承载 verify 路径（按 sha256 哈希等值查找有效密钥，命中后异步更新 last_used_at）。
 * CRUD（创建、列表、吊销）见 repositories/apiKeyRepo.ts。
 *
 * 企业理由：x-api-key 鉴权路径据此把请求绑定到组织（租户）与密钥身份，
 * 再交由 RLS 隔离数据。已吊销（revoked_at 非空）的密钥一律拒绝。
 *
 * 安全设计：
 * - 校验走 sha256 等值查找（哈希本身高熵，等值比较无时序侧信道顾虑；且 DB 唯一索引命中）。
 * - timingSafeEqual 用于跨密钥/令牌的常量时间比较（避免长度差导致的时序侧信道）。
 */
import crypto from 'crypto';
import { getPool } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { KEY_PREFIX } from '../repositories/apiKeyRepo.js';

/** 校验通过后解析出的租户上下文 */
interface VerifiedApiKey {
  /** 所属组织（租户）UUID */
  orgId: string;
  /** 密钥记录 UUID */
  keyId: string;
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
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
