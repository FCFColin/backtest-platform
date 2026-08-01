/**
 * 审计存储服务（P2-03 不可篡改审计存储）：HMAC-SHA256 签名防篡改 + prev_hash 链式完整性校验。
 * 与 outbox 互补：outbox 是临时事件队列，audit_logs 是持久化审计存储（保留 ≥180 天）。
 * 未配置 AUDIT_HMAC_KEY 时签名返回空字符串，校验 fail-closed（D2-010）。
 */
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPool } from '../db/pool.js';
import { rowMapper, iso, toIso } from '../repositories/rowMapper.js';

/** 与迁移 022 的 CHECK 约束对齐 */
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
interface AuditLogQueryFilters {
  orgId?: string;
  eventType?: string;
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}
interface PaginatedAuditLogs {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
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

export async function writeAuditLog(entry: AuditLogEntry, client?: PoolClient): Promise<string> {
  const conn = client ?? getPool();
  const payloadStr = JSON.stringify(entry.payload);
  const signature = signAuditEntry(payloadStr);
  const prevResult = await conn.query(
    'SELECT id, hmac_signature FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1',
  );
  const prevRow = prevResult.rows[0];
  const prevHash = prevRow
    ? computePrevHash(prevRow.id as string, prevRow.hmac_signature as string)
    : null;
  const { rows } = await conn.query(
    `INSERT INTO audit_logs (event_type, user_id, org_id, ip_address, action, resource_type, resource_id, payload, hmac_signature, prev_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) RETURNING id`,
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
    ],
  );
  const id = rows[0].id as string;
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
  return id;
}

export async function getUnexportedAuditLogs(
  limit: number = UNEXPORTED_BATCH_LIMIT,
): Promise<AuditLogRow[]> {
  const { rows } = await getPool().query(
    `SELECT ${AUDIT_LOG_COLUMNS} FROM audit_logs WHERE exported_at IS NULL ORDER BY created_at ASC LIMIT $1`,
    [limit],
  );
  return rows.map(mapAuditLogRow);
}

export async function markExported(ids: string[], objectKey: string): Promise<void> {
  if (ids.length === 0) return;
  await getPool().query(
    `UPDATE audit_logs SET exported_at = NOW(), object_key = $2 WHERE id = ANY($1::uuid[])`,
    [ids, objectKey],
  );
  logger.info(
    { module: 'auditStorage', count: ids.length, objectKey },
    '[auditStorage] 审计日志已标记为已导出',
  );
}

export async function queryAuditLogs(
  filters: AuditLogQueryFilters,
  page: number = 1,
  limit: number = 50,
): Promise<PaginatedAuditLogs> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;
  const allFilters: Array<[string, string | undefined, string]> = [
    ['org_id', filters.orgId, '='],
    ['event_type', filters.eventType, '='],
    ['user_id', filters.userId, '='],
    ['action', filters.action, '='],
    ['created_at', filters.startDate, '>='],
    ['created_at', filters.endDate, '<='],
  ];
  for (const [col, val, op] of allFilters) {
    if (val) {
      conditions.push(`${col} ${op} $${paramIdx++}`);
      params.push(val);
    }
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  const pool = getPool();
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT ${AUDIT_LOG_COLUMNS} FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs ${whereClause}`, params),
  ]);
  return {
    logs: dataResult.rows.map(mapAuditLogRow),
    total: countResult.rows[0].total as number,
    page,
    limit,
  };
}

export async function verifyAuditIntegrity(
  logId: string,
): Promise<{ valid: boolean; expected: string; actual: string }> {
  const { rows } = await getPool().query(
    `SELECT payload, hmac_signature FROM audit_logs WHERE id = $1`,
    [logId],
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

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function verifyAuditChain(): Promise<{
  valid: boolean;
  totalChecked: number;
  brokenLinks: Array<{ id: string; expectedPrevHash: string; actualPrevHash: string | null }>;
}> {
  const pool = getPool();
  const brokenLinks: Array<{
    id: string;
    expectedPrevHash: string;
    actualPrevHash: string | null;
  }> = [];
  let prevId: string | null = null;
  let prevSig: string | null = null;
  let totalChecked = 0;
  let lastId: string | null = null;
  while (true) {
    const params: unknown[] = [1000];
    const query =
      lastId === null
        ? 'SELECT id, hmac_signature, prev_hash FROM audit_logs ORDER BY created_at ASC, id ASC LIMIT $1'
        : `SELECT id, hmac_signature, prev_hash FROM audit_logs WHERE (created_at, id) > (SELECT created_at, id FROM audit_logs WHERE id = $2) ORDER BY created_at ASC, id ASC LIMIT $1`;
    if (lastId) params.push(lastId);
    const result = await pool.query(query, params);
    if (result.rows.length === 0) break;
    for (const row of result.rows) {
      const r = row as { id: string; hmac_signature: string; prev_hash: string | null };
      if (prevId !== null && prevSig !== null) {
        const expectedPrevHash = computePrevHash(prevId, prevSig);
        if (r.prev_hash !== expectedPrevHash)
          brokenLinks.push({ id: r.id, expectedPrevHash, actualPrevHash: r.prev_hash });
      }
      prevId = r.id;
      prevSig = r.hmac_signature;
      totalChecked++;
    }
    lastId = result.rows[result.rows.length - 1].id as string;
    if (totalChecked % 5000 === 0)
      logger.info(`[auditStorage] 审计链验证进度: ${totalChecked} 条已检查`);
  }
  logger.info(
    { module: 'auditStorage', totalChecked, brokenLinks: brokenLinks.length },
    '[auditStorage] 链式完整性校验完成',
  );
  return { valid: brokenLinks.length === 0, totalChecked, brokenLinks };
}
