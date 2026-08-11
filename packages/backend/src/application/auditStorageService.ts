// P2-03: HMAC-SHA256 签名防篡改 + prev_hash 链式完整性；未配置 AUDIT_HMAC_KEY 时 fail-closed（D2-010）
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { withPlatformContext } from '../db/pool.js';
import { rowMapper, iso, toIso } from '../repositories/rowMapper.js';

export type AuditAction =
  'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'READ' | 'EXPORT' | 'CONFIG';

export interface AuditLogEntry {
  eventType: string;
  userId?: string | null;
  orgId?: string | null;
  ipAddress?: string | null;
  action: AuditAction;
  resourceType?: string | null;
  resourceId?: string | null;
  payload: Record<string, unknown>;
}
export interface AuditLogRow {
  id: string;
  eventType: string;
  userId: string | null;
  orgId: string | null;
  ipAddress: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  payload: Record<string, unknown>;
  hmacSignature: string;
  /** P2-04: 前一条记录的链式 hash（SHA256(prev.id || prev.hmac_signature)） */ prevHash:
    string | null;
  objectKey: string | null;
  exportedAt: string | null;
  createdAt: string;
}

const UNEXPORTED_BATCH_LIMIT = 100;
const AUDIT_LOG_COLUMNS =
  'id, event_type, user_id, org_id, ip_address, action, resource_type, resource_id, payload, hmac_signature, object_key, exported_at, created_at';

export function signAuditEntry(payload: string): string {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) {
    logger.warn('[auditStorage] AUDIT_HMAC_KEY not set, audit log signing disabled');
    return '';
  }
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}
function computePrevHash(id: string, signature: string): string {
  return crypto.createHash('sha256').update(`${id}${signature}`).digest('hex');
}

export async function writeAuditLog(
  entry: AuditLogEntry,
  client: PoolClient,
  outboxEventId?: string,
): Promise<string | null> {
  const payloadStr = JSON.stringify(entry.payload);
  const signature = signAuditEntry(payloadStr);
  const prevResult = await client.query(
    'SELECT id, hmac_signature FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1',
  );
  const prevRow = prevResult.rows[0];
  const prevHash = prevRow
    ? computePrevHash(prevRow.id as string, prevRow.hmac_signature as string)
    : null;
  const { rows } = await client.query(
    `INSERT INTO audit_logs (event_type, user_id, org_id, ip_address, action, resource_type, resource_id, payload, hmac_signature, prev_hash, outbox_event_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11) ON CONFLICT (outbox_event_id) WHERE outbox_event_id IS NOT NULL DO NOTHING RETURNING id`,
    [
      entry.eventType,
      entry.userId ?? null,
      entry.orgId ?? null,
      entry.ipAddress ?? null,
      entry.action,
      entry.resourceType ?? null,
      entry.resourceId ?? null,
      payloadStr,
      signature,
      prevHash,
      outboxEventId ?? null,
    ],
  );
  const id = rows[0]?.id as string | undefined;
  if (!id && outboxEventId) {
    const existing = await client.query('SELECT id FROM audit_logs WHERE outbox_event_id = $1', [
      outboxEventId,
    ]);
    return (existing.rows[0]?.id as string | undefined) ?? null;
  }
  logger.debug(
    {
      module: 'auditStorage',
      id,
      eventType: entry.eventType,
      action: entry.action,
      hasPrevHash: prevHash !== null,
    },
    '[auditStorage] 审计日志已写入（含链式 prev_hash）',
  );
  return id ?? null;
}

export async function getUnexportedAuditLogs(
  limit: number = UNEXPORTED_BATCH_LIMIT,
): Promise<AuditLogRow[]> {
  const { rows } = await withPlatformContext((client) =>
    client.query(
      `SELECT ${AUDIT_LOG_COLUMNS} FROM audit_logs WHERE exported_at IS NULL ORDER BY created_at ASC LIMIT $1`,
      [limit],
    ),
  );
  return rows.map(mapAuditLogRow);
}

export async function markExported(ids: string[], objectKey: string): Promise<void> {
  if (ids.length === 0) return;
  await withPlatformContext((client) =>
    client.query(
      `UPDATE audit_logs SET exported_at = NOW(), object_key = $2 WHERE id = ANY($1::uuid[])`,
      [ids, objectKey],
    ),
  );
  logger.info(
    { module: 'auditStorage', count: ids.length, objectKey },
    '[auditStorage] 审计日志已标记为已导出',
  );
}

export async function verifyAuditIntegrity(
  logId: string,
): Promise<{ valid: boolean; expected: string; actual: string }> {
  const { rows } = await withPlatformContext((client) =>
    client.query(`SELECT payload, hmac_signature FROM audit_logs WHERE id = $1`, [logId]),
  );
  if (rows.length === 0) return { valid: false, expected: '', actual: '' };
  const storedSignature = rows[0].hmac_signature as string;
  const payload = rows[0].payload;
  const key = config.AUDIT_HMAC_KEY;
  if (!key) return { valid: false, expected: '', actual: storedSignature };
  const expected = crypto
    .createHmac('sha256', key)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
  const sigBuf = Buffer.from(storedSignature);
  const expBuf = Buffer.from(expected);
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  if (!valid)
    logger.warn(
      { module: 'auditStorage', logId },
      '[auditStorage] 审计日志完整性校验失败（疑似篡改）',
    );
  return { valid, expected, actual: storedSignature };
}

const mapAuditLogRow = rowMapper<AuditLogRow>({
  id: 'id',
  eventType: 'event_type',
  userId: 'user_id',
  orgId: 'org_id',
  ipAddress: 'ip_address',
  action: 'action',
  resourceType: 'resource_type',
  resourceId: 'resource_id',
  payload: (r) =>
    typeof r.payload === 'string'
      ? (JSON.parse(r.payload) as Record<string, unknown>)
      : (r.payload as Record<string, unknown>),
  hmacSignature: 'hmac_signature',
  prevHash: 'prev_hash',
  objectKey: 'object_key',
  exportedAt: (r) => toIso(r.exported_at),
  createdAt: (r) => iso(r.created_at),
});
