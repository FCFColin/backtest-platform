/**
 * 审计存储服务（P2-03 不可篡改审计存储）。
 * HMAC-SHA256 签名提供篡改检测；prev_hash 链式 hash 提供完整性校验。
 * 与 outbox 互补：outbox 是临时事件队列，audit_logs 是持久化审计存储（保留 ≥180 天）。
 * 未配置 AUDIT_HMAC_KEY 时签名返回空字符串，校验 fail-closed（D2-010）。
 */
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPool } from '../db/pool.js';

/** 与迁移 022 的 CHECK 约束对齐 */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'READ' | 'EXPORT' | 'CONFIG';

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
  /** P2-04: 前一条记录的链式 hash（SHA256(prev.id || prev.hmac_signature)） */
  prevHash: string | null;
  objectKey: string | null;
  exportedAt: string | null;
  createdAt: string;
}

export interface AuditLogQueryFilters {
  orgId?: string;
  eventType?: string;
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedAuditLogs {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

export const UNEXPORTED_BATCH_LIMIT = 100;

const AUDIT_LOG_COLUMNS = `id, event_type, user_id, org_id, ip_address, action, resource_type, resource_id,
  payload, hmac_signature, object_key, exported_at, created_at`;

/** 对审计日志 payload 字符串进行 HMAC-SHA256 签名。密钥由 KMS 管理，DBA 无法伪造。未配置密钥返回空字符串。 */
export function signAuditEntry(payload: string): string {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) {
    logger.warn('[auditStorage] AUDIT_HMAC_KEY not set, audit log signing disabled');
    return '';
  }
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

/** 计算 prev_hash = SHA256(id || hmac_signature)，用于链式完整性校验。 */
function computePrevHash(id: string, signature: string): string {
  return crypto.createHash('sha256').update(`${id}${signature}`).digest('hex');
}

/** 将审计日志写入 audit_logs 表（含 HMAC 签名 + 链式 prev_hash）。client 可选，传入时参与调用方事务。 */
export async function writeAuditLog(entry: AuditLogEntry, client?: PoolClient): Promise<string> {
  const conn = client ?? getPool();
  const payloadStr = JSON.stringify(entry.payload);
  const signature = signAuditEntry(payloadStr);
  const prevResult = await conn.query(
    'SELECT id, hmac_signature FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1',
  );
  const prevRow = prevResult.rows[0];
  const prevHash = prevRow ? computePrevHash(prevRow.id as string, prevRow.hmac_signature as string) : null;
  const { rows } = await conn.query(
    `INSERT INTO audit_logs
       (event_type, user_id, org_id, ip_address, action, resource_type, resource_id, payload, hmac_signature, prev_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
     RETURNING id`,
    [
      entry.eventType, entry.userId ?? null, entry.orgId ?? null, entry.ipAddress ?? null,
      entry.action, entry.resourceType ?? null, entry.resourceId ?? null,
      payloadStr, signature, prevHash,
    ],
  );
  const id = rows[0].id as string;
  logger.debug({ module: 'auditStorage', id, eventType: entry.eventType, action: entry.action, hasPrevHash: prevHash !== null }, '[auditStorage] 审计日志已写入（含链式 prev_hash）');
  return id;
}

/** 查询未导出至 MinIO 的审计日志（按创建时间正序，便于按日期分组导出）。 */
export async function getUnexportedAuditLogs(limit: number = UNEXPORTED_BATCH_LIMIT): Promise<AuditLogRow[]> {
  const { rows } = await getPool().query(
    `SELECT ${AUDIT_LOG_COLUMNS} FROM audit_logs WHERE exported_at IS NULL ORDER BY created_at ASC LIMIT $1`,
    [limit],
  );
  return rows.map(mapAuditLogRow);
}

/** 标记审计日志已导出至 MinIO（回填 object_key 与 exported_at）。 */
export async function markExported(ids: string[], objectKey: string): Promise<void> {
  if (ids.length === 0) return;
  await getPool().query(
    `UPDATE audit_logs SET exported_at = NOW(), object_key = $2 WHERE id = ANY($1::uuid[])`,
    [ids, objectKey],
  );
  logger.info({ module: 'auditStorage', count: ids.length, objectKey }, '[auditStorage] 审计日志已标记为已导出');
}

/** 分页查询审计日志（动态 WHERE 拼接，参数化查询防 SQL 注入）。 */
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

/**
 * 校验审计日志的 HMAC 完整性（篡改检测）。
 * 重算 payload 的 HMAC 与存储的 hmac_signature 比对，使用 crypto.timingSafeEqual 常量时间比较防时序攻击。
 * 未配置 AUDIT_HMAC_KEY 时 fail-closed 返回 valid=false（D2-010）。
 */
export async function verifyAuditIntegrity(
  logId: string,
): Promise<{ valid: boolean; expected: string; actual: string }> {
  const { rows } = await getPool().query(`SELECT payload, hmac_signature FROM audit_logs WHERE id = $1`, [logId]);
  if (rows.length === 0) return { valid: false, expected: '', actual: '' };
  const storedSignature = rows[0].hmac_signature as string;
  const payload = rows[0].payload;
  // Security (D2-010): fail-closed — 未配置密钥时验证失败
  const key = config.AUDIT_HMAC_KEY;
  if (!key) return { valid: false, expected: '', actual: storedSignature };
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const expected = crypto.createHmac('sha256', key).update(payloadStr).digest('hex');
  const sigBuf = Buffer.from(storedSignature);
  const expBuf = Buffer.from(expected);
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  if (!valid) {
    logger.warn({ module: 'auditStorage', logId }, '[auditStorage] 审计日志完整性校验失败（疑似篡改）');
  }
  return { valid, expected, actual: storedSignature };
}

function mapAuditLogRow(row: Record<string, unknown>): AuditLogRow {
  const payload = row.payload;
  return {
    id: row.id as string,
    eventType: row.event_type as string,
    userId: row.user_id as string | null,
    orgId: row.org_id as string | null,
    ipAddress: row.ip_address as string | null,
    action: row.action as string,
    resourceType: row.resource_type as string | null,
    resourceId: row.resource_id as string | null,
    payload:
      typeof payload === 'string'
        ? (JSON.parse(payload) as Record<string, unknown>)
        : (payload as Record<string, unknown>),
    hmacSignature: row.hmac_signature as string,
    prevHash: row.prev_hash as string | null,
    objectKey: row.object_key as string | null,
    exportedAt: row.exported_at ? new Date(row.exported_at as string).toISOString() : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

/** P2-04: 验证审计日志链式完整性。遍历 audit_logs 重算 prev_hash 与存储值比对，不匹配记为断裂点。 */
export async function verifyAuditChain(): Promise<{
  valid: boolean;
  totalChecked: number;
  brokenLinks: Array<{ id: string; expectedPrevHash: string; actualPrevHash: string | null }>;
}> {
  const pool = getPool();
  const brokenLinks: Array<{ id: string; expectedPrevHash: string; actualPrevHash: string | null }> = [];
  let prevId: string | null = null;
  let prevSig: string | null = null;
  let totalChecked = 0;
  const BATCH_SIZE = 1000;
  let lastId: string | null = null;
  // 分页验证，避免一次加载数百万行
  while (true) {
    const params: unknown[] = [BATCH_SIZE];
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
        if (r.prev_hash !== expectedPrevHash) {
          brokenLinks.push({ id: r.id, expectedPrevHash, actualPrevHash: r.prev_hash });
        }
      }
      prevId = r.id;
      prevSig = r.hmac_signature;
      totalChecked++;
    }
    lastId = result.rows[result.rows.length - 1].id as string;
    if (totalChecked % 5000 === 0) {
      logger.info(`[auditStorage] 审计链验证进度: ${totalChecked} 条已检查`);
    }
  }
  const valid = brokenLinks.length === 0;
  logger.info({ module: 'auditStorage', totalChecked, brokenLinks: brokenLinks.length }, '[auditStorage] 链式完整性校验完成');
  return { valid, totalChecked, brokenLinks };
}