import crypto from 'crypto';
import { getPool, withTenant, withPlatformContext } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { sha256Hex, hashApiKeyArgon2id } from '../utils/crypto.js';
import { rowMapper, iso, toIso } from './rowMapper.js';

export const KEY_PREFIX = 'bpk_live_';
const DISPLAY_PREFIX_LEN = 16;
export const PLATFORM_ADMIN_KEY_MAX_TTL_DAYS = 90;

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
interface StaleApiKey {
  id: string;
  orgId: string | null;
  isPlatformAdmin: boolean;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const PLATFORM_KEY_COLUMNS =
  'id, org_id, name, key_prefix, is_platform_admin, created_by, created_at, last_used_at, revoked_at, expires_at';

type ApiKeyRow = {
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
};
const mapRow = rowMapper<ApiKeyRecord>({
  id: 'id',
  orgId: 'org_id',
  name: 'name',
  keyPrefix: 'key_prefix',
  isPlatformAdmin: 'is_platform_admin',
  createdBy: 'created_by',
  createdAt: (r) => iso(r.created_at),
  lastUsedAt: (r) => toIso(r.last_used_at),
  revokedAt: (r) => toIso(r.revoked_at),
  expiresAt: (r) => toIso(r.expires_at),
});
const mapStaleApiKey = rowMapper<StaleApiKey>({
  id: 'id',
  orgId: 'org_id',
  isPlatformAdmin: 'is_platform_admin',
  name: 'name',
  keyPrefix: 'key_prefix',
  lastUsedAt: (r) => toIso(r.last_used_at),
  createdAt: (r) => iso(r.created_at),
});

function generatePlatformKeyPlaintext(): string {
  return `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

async function deriveKeyFields(plaintext: string) {
  return {
    keyHash: sha256Hex(plaintext),
    keyHashArgon2: await hashApiKeyArgon2id(plaintext),
    keyPrefix: plaintext.slice(0, DISPLAY_PREFIX_LEN),
  };
}

export async function createApiKey(
  orgId: string,
  name: string,
  createdBy: string | null,
): Promise<CreatedApiKey> {
  const plaintext = generatePlatformKeyPlaintext();
  const { keyHash, keyHashArgon2, keyPrefix } = await deriveKeyFields(plaintext);
  const { rows } = await withTenant(orgId, (client) =>
    client.query(
      `INSERT INTO api_keys (org_id, name, key_hash, key_hash_argon2, key_prefix, created_by, is_platform_admin) VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING ${PLATFORM_KEY_COLUMNS}`,
      [orgId, name, keyHash, keyHashArgon2, keyPrefix, createdBy],
    ),
  );
  logger.info({ orgId, keyId: rows[0].id, createdBy }, '[apiKeyService] 已创建 API Key');
  return { ...mapRow(rows[0]), plaintext };
}

export async function listApiKeys(orgId: string): Promise<ApiKeyRecord[]> {
  const { rows } = await withTenant(orgId, (client) =>
    client.query(
      `SELECT ${PLATFORM_KEY_COLUMNS} FROM api_keys WHERE org_id = $1 ORDER BY created_at DESC`,
      [orgId],
    ),
  );
  return rows.map(mapRow);
}

export async function revokeApiKey(orgId: string, keyId: string): Promise<boolean> {
  const { rowCount } = await withTenant(orgId, (client) =>
    client.query(
      `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL`,
      [keyId, orgId],
    ),
  );
  const ok = (rowCount ?? 0) > 0;
  if (ok) logger.info({ orgId, keyId }, '[apiKeyService] 已吊销 API Key');
  return ok;
}

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: ApiKeyRow[] }>;
};
interface InsertPlatformKeyArgs {
  plaintext: string;
  name: string;
  expiresInDays: number;
  createdBy: string | null;
  action: '已创建' | '已轮换';
  oldKeyId?: string;
}
async function insertPlatformAdminKey(
  exec: Queryable,
  args: InsertPlatformKeyArgs,
): Promise<CreatedApiKey> {
  const { plaintext, name, expiresInDays, createdBy, action, oldKeyId } = args;
  const ttl = Math.min(expiresInDays, PLATFORM_ADMIN_KEY_MAX_TTL_DAYS);
  const { keyHash, keyHashArgon2, keyPrefix } = await deriveKeyFields(plaintext);
  const { rows } = await exec.query(
    `INSERT INTO api_keys (org_id, name, key_hash, key_hash_argon2, key_prefix, created_by, is_platform_admin, expires_at) VALUES (NULL, $1, $2, $3, $4, $5, TRUE, NOW() + make_interval(days => $6)) RETURNING ${PLATFORM_KEY_COLUMNS}`,
    [name, keyHash, keyHashArgon2, keyPrefix, createdBy, ttl],
  );
  logger.warn(
    { keyId: rows[0].id, ttlDays: ttl, createdBy, ...(oldKeyId ? { oldKeyId } : {}) },
    `[apiKeyService] 平台 break-glass 密钥${action}`,
  );
  return { ...mapRow(rows[0]), plaintext };
}

export async function createPlatformAdminKey(
  plaintext: string,
  name: string,
  expiresInDays: number,
  createdBy: string | null,
): Promise<CreatedApiKey> {
  return withPlatformContext((client) =>
    insertPlatformAdminKey(client, {
      plaintext,
      name,
      expiresInDays,
      createdBy,
      action: '已创建',
    }),
  );
}

export async function rotatePlatformAdminKey(
  oldKeyId: string,
  name: string,
  expiresInDays: number,
  createdBy: string | null,
): Promise<CreatedApiKey> {
  return withPlatformContext(async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM api_keys WHERE id = $1 AND is_platform_admin = TRUE AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) FOR UPDATE`,
      [oldKeyId],
    );
    if (rows.length === 0) throw new Error('PLATFORM_ADMIN_KEY_NOT_FOUND');
    await client.query('UPDATE api_keys SET revoked_at = NOW() WHERE id = $1', [oldKeyId]);
    return insertPlatformAdminKey(client, {
      plaintext: generatePlatformKeyPlaintext(),
      name,
      expiresInDays,
      createdBy,
      action: '已轮换',
      oldKeyId,
    });
  });
}

export async function listPlatformAdminKeys(): Promise<ApiKeyRecord[]> {
  const { rows } = await getPool().query(
    `SELECT ${PLATFORM_KEY_COLUMNS} FROM api_keys WHERE is_platform_admin = TRUE ORDER BY created_at DESC`,
  );
  return rows.map(mapRow);
}

export async function revokePlatformAdminKey(keyId: string): Promise<boolean> {
  return withPlatformContext(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND is_platform_admin = TRUE AND revoked_at IS NULL`,
      [keyId],
    );
    const ok = (rowCount ?? 0) > 0;
    if (ok) logger.warn({ keyId }, '[apiKeyService] 已吊销平台 break-glass 密钥');
    return ok;
  });
}

export async function countActivePlatformAdminKeys(): Promise<number> {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS cnt FROM api_keys WHERE is_platform_admin = TRUE AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
  );
  return rows[0]?.cnt ?? 0;
}

export async function findStaleApiKeys(thresholdDays: number): Promise<StaleApiKey[]> {
  const { rows } = await getPool().query(
    `SELECT id, org_id, is_platform_admin, name, key_prefix, last_used_at, created_at FROM api_keys WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) AND (last_used_at IS NULL OR last_used_at < NOW() - make_interval(days => $1))`,
    [thresholdDays],
  );
  return rows.map(mapStaleApiKey);
}
