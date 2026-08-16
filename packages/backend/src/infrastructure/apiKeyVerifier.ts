// ADR-009 + P0-04: Redis 吊销缓存为 DB revoked_at 之外的跨 Pod 二次防线
import { getPool, withTenant } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { KEY_PREFIX, PLATFORM_ADMIN_KEY_MAX_TTL_DAYS } from '../repositories/apiKeyRepo.js';
import { getOrg } from '../repositories/orgRepo.js';
import { sha256Hex, verifyApiKeyArgon2id } from '../utils/crypto.js';
import { appRedis } from '../infrastructure/redisClient.js';
import { requireRedis } from '../utils/redisFallback.js';

const APIKEY_REVOKED_PREFIX = 'apikey:revoked:';

export interface VerifiedApiKey {
  /** 平台 break-glass 密钥为 null */
  orgId: string | null;
  keyId: string;
  isPlatformAdmin: boolean;
}

interface ApiKeyCandidate {
  id: string;
  org_id: string | null;
  is_platform_admin: boolean;
  key_hash_argon2: string | null;
}

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

// 挂起组织的密钥必须拒用（与 enforceOrgActive 语义一致）；查询失败 fail-closed
async function isOrgActive(orgId: string): Promise<boolean> {
  try {
    const org = await getOrg(orgId);
    return org !== null && org.status !== 'suspended';
  } catch (err) {
    logger.error({ err: String(err), orgId }, '[apiKeyService] 组织状态查询失败，fail-closed');
    return false;
  }
}

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

  if (await isApiKeyRevoked(keyId)) {
    logger.warn({ keyId }, '[apiKeyService] 密钥命中 Redis 吊销缓存，拒绝访问');
    return null;
  }

  if (candidate.key_hash_argon2) {
    const ok = await verifyApiKeyArgon2id(candidate.key_hash_argon2, plaintext);
    if (!ok) {
      logger.warn({ keyId }, '[apiKeyService] argon2id 校验失败，拒绝访问');
      return null;
    }
  }

  if (candidate.org_id && !(await isOrgActive(candidate.org_id))) {
    logger.warn({ keyId, orgId: candidate.org_id }, '[apiKeyService] 组织已挂起，拒绝访问');
    return null;
  }

  const touch = candidate.org_id
    ? withTenant(candidate.org_id, (client) =>
        client.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyId]),
      )
    : Promise.resolve();
  void touch.catch((err) =>
    logger.warn({ err: String(err), keyId }, '[apiKeyService] last_used_at 更新失败'),
  );

  return {
    orgId: candidate.org_id,
    keyId,
    isPlatformAdmin: candidate.is_platform_admin,
  };
}
