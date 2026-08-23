// P2-03: HMAC-SHA256 签名防篡改 + prev_hash 链式完整性；AUDIT_HMAC_KEY 由 config/index.ts 生产强制 ≥32 字节，缺失时降级不签名（仅开发环境可达）
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { logger } from '../utils/logger.js';
import { withPlatformContext } from '../db/pool.js';
import { rowMapper, iso, toIso } from '../repositories/rowMapper.js';
import { signAuditEntry, verifyAuditEntry } from '../utils/auditCrypto.js';

export { signAuditEntry };

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
// 链式追加串行化：并发写审计时 prev_hash 读取+写入须原子，事务级 advisory lock（提交即释放）
const AUDIT_CHAIN_LOCK_ID = 0x4155444954;
const AUDIT_LOG_COLUMNS =
  'id, event_type, user_id, org_id, ip_address, action, resource_type, resource_id, payload, hmac_signature, object_key, exported_at, created_at';

function computePrevHash(id: string, signature: string): string {
  return crypto.createHash('sha256').update(`${id}${signature}`).digest('hex');
}

export async function writeAuditLog(
  entry: AuditLogEntry,
  client: PoolClient,
  outboxEventId?: string,
): Promise<string | null> {
  await client.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_CHAIN_LOCK_ID]);
  const payloadStr = JSON.stringify(entry.payload);
  const prevResult = await client.query(
    'SELECT id, hmac_signature FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1',
  );
  const prevRow = prevResult.rows[0];
  const prevHash = prevRow
    ? computePrevHash(prevRow.id as string, prevRow.hmac_signature as string)
    : null;
  // P0: 签名必须覆盖 jsonb 规范化后的精确字节（PG 按"键长→字节序"重排键序），
  // 故先 INSERT 返回 payload::text，再回写签名——同一事务（withTenant）内原子。
  const { rows } = await client.query(
    `INSERT INTO audit_logs (event_type, user_id, org_id, ip_address, action, resource_type, resource_id, payload, hmac_signature, prev_hash, outbox_event_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11) ON CONFLICT (outbox_event_id) WHERE outbox_event_id IS NOT NULL DO NOTHING RETURNING id, payload::text`,
    [
      entry.eventType,
      entry.userId ?? null,
      entry.orgId ?? null,
      entry.ipAddress ?? null,
      entry.action,
      entry.resourceType ?? null,
      entry.resourceId ?? null,
      payloadStr,
      '',
      prevHash,
      outboxEventId ?? null,
    ],
  );
  const row = rows[0];
  if (!row) {
    if (outboxEventId) {
      const existing = await client.query('SELECT id FROM audit_logs WHERE outbox_event_id = $1', [
        outboxEventId,
      ]);
      return (existing.rows[0]?.id as string | undefined) ?? null;
    }
    return null;
  }
  const signature = signAuditEntry(row.payload as string);
  await client.query('UPDATE audit_logs SET hmac_signature = $2, prev_hash = $3 WHERE id = $1', [
    row.id,
    signature,
    prevHash,
  ]);
  logger.debug(
    {
      module: 'auditStorage',
      id: row.id,
      eventType: entry.eventType,
      action: entry.action,
      hasPrevHash: prevHash !== null,
    },
    '[auditStorage] 审计日志已写入（含链式 prev_hash）',
  );
  return row.id as string;
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
      // 仅标记仍未导出的行：并发/重复导出不会覆盖已导出的 object_key，保证幂等
      `UPDATE audit_logs SET exported_at = NOW(), object_key = $2 WHERE id = ANY($1::uuid[]) AND exported_at IS NULL`,
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
  // P0: 签名基于 payload::text（jsonb 规范化后的精确字节），与 writeAuditLog 回写时一致
  const { rows } = await withPlatformContext((client) =>
    client.query(
      'SELECT payload::text AS payload_text, hmac_signature FROM audit_logs WHERE id = $1',
      [logId],
    ),
  );
  if (rows.length === 0) return { valid: false, expected: '', actual: '' };
  const storedSignature = rows[0].hmac_signature as string;
  const payloadText = rows[0].payload_text as string;
  const expected = signAuditEntry(payloadText);
  const valid = verifyAuditEntry(payloadText, storedSignature);
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
