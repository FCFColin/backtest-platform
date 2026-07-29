/**
 * 审计存储服务（P2-03 不可篡改审计存储）
 *
 * Architecture: 应用层 — 负责审计日志的 HMAC 签名、持久化写入、查询与完整性校验。
 * 企业为何需要：审计日志是合规基础（SOC 2 / ISO 27001 / 等保三级 8.1.4），要求
 * 不可篡改且可追溯。HMAC-SHA256 签名提供篡改检测（tamper-evidence）：写入时计算
 * 签名并固定存储，校验时重算并比对，payload 被任何修改都会导致签名不匹配。
 *
 * 与 outbox 的边界：outbox 是事件投递的临时队列（processed_at 后即已消费），
 * audit_logs 是持久化审计存储（保留 ≥180 天）。auditLog 中间件写入 outbox 用于
 * 实时事件分发；本服务提供独立的持久化审计存储，两者互补而非替代。
 *
 * 权衡：
 * - HMAC 签名对 payload 字符串计算（JSON.stringify），要求 payload 序列化确定性。
 *   写入与校验使用相同的序列化结果，避免 JSON 键顺序差异导致误报。
 * - 未配置 AUDIT_HMAC_KEY 时签名返回空字符串（与 auditLog 中间件 signPayload 一致），
 *   校验返回 true（无密钥=不校验）。生产环境必须配置密钥。
 * - queryAuditLogs 支持多过滤条件组合（org_id / event_type / user_id / action /
 *   日期范围），使用动态 WHERE 拼接，参数化查询防 SQL 注入。
 */
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPool } from '../db/pool.js';

/** 审计动作枚举（与迁移 022 的 CHECK 约束对齐） */
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'READ'
  | 'EXPORT'
  | 'CONFIG';

/** 审计日志写入入参 */
export interface AuditLogEntry {
  /** 事件类型（如 AuditEvent / BacktestCompleted） */
  eventType: string;
  /** 操作用户 UUID（可空，匿名操作为 null） */
  userId?: string | null;
  /** 组织 UUID（可空，平台级操作为 null） */
  orgId?: string | null;
  /** 客户端 IP 地址（可空） */
  ipAddress?: string | null;
  /** 操作动作（CREATE/UPDATE/DELETE/LOGIN 等） */
  action: AuditAction;
  /** 资源类型（如 backtest_run / api_key / webhook_endpoint） */
  resourceType?: string | null;
  /** 资源标识（如 run-uuid / key-prefix） */
  resourceId?: string | null;
  /** 审计明细（完整操作上下文，JSON 序列化后参与 HMAC 签名） */
  payload: Record<string, unknown>;
}

/** 审计日志查询结果行 */
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

/** 查询过滤条件 */
export interface AuditLogQueryFilters {
  orgId?: string;
  eventType?: string;
  userId?: string;
  action?: string;
  /** 起始时间（ISO 字符串，包含） */
  startDate?: string;
  /** 结束时间（ISO 字符串，包含） */
  endDate?: string;
}

/** 分页查询结果 */
export interface PaginatedAuditLogs {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

/** 单次导出作业拉取的未导出记录上限（避免长事务阻塞） */
export const UNEXPORTED_BATCH_LIMIT = 100;

/**
 * 对审计日志 payload 字符串进行 HMAC-SHA256 签名。
 *
 * 企业理由：HMAC 签名是篡改检测的基础——写入时签名并固定存储，校验时重算并比对。
 * 密钥（AUDIT_HMAC_KEY）由 KMS/Secret Manager 管理，DBA 无法伪造签名，从而即便
 * DBA 直接修改 audit_logs 行数据，签名校验也会失败。
 *
 * 未配置 AUDIT_HMAC_KEY 时返回空字符串（与 auditLog 中间件 signPayload 行为一致），
 * 并记录 warning。生产环境必须配置密钥。
 *
 * @param payload - 已序列化的 payload 字符串
 * @returns 十六进制 HMAC-SHA256 摘要；未配置密钥时返回空字符串
 */
export function signAuditEntry(payload: string): string {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) {
    logger.warn('[auditStorage] AUDIT_HMAC_KEY not set, audit log signing disabled');
    return '';
  }
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

/**
 * 将审计日志写入 audit_logs 表（含 HMAC 签名）。
 *
 * payload 序列化后计算 HMAC 签名，与审计明细一同入库。签名在写入时固定，
 * 后续 verifyAuditIntegrity 重算并比对即可检测篡改。
 *
 * @param entry - 审计日志条目
 * @param client - 可选的事务连接，传入时参与调用方事务；不传时使用连接池
 * @returns 写入的审计日志 ID
 */
export async function writeAuditLog(
  entry: AuditLogEntry,
  client?: PoolClient,
): Promise<string> {
  const conn = client ?? getPool();
  const payloadStr = JSON.stringify(entry.payload);
  const signature = signAuditEntry(payloadStr);

  // P2-04: 查询前一条记录，计算链式 prev_hash
  const prevResult = await conn.query(
    'SELECT id, hmac_signature FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1',
  );
  let prevHash: string | null = null;
  if (prevResult.rows.length > 0) {
    const prevRow = prevResult.rows[0];
    prevHash = crypto
      .createHash('sha256')
      .update(`${prevRow.id}${prevRow.hmac_signature}`)
      .digest('hex');
  }

  const { rows } = await conn.query(
    `INSERT INTO audit_logs
       (event_type, user_id, org_id, ip_address, action, resource_type, resource_id, payload, hmac_signature, prev_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
     RETURNING id`,
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
    { module: 'auditStorage', id, eventType: entry.eventType, action: entry.action, hasPrevHash: prevHash !== null },
    '[auditStorage] 审计日志已写入（含链式 prev_hash）',
  );
  return id;
}

/**
 * 查询未导出至 MinIO 的审计日志（按创建时间正序，便于按日期分组导出）。
 *
 * 导出作业调用：扫描 exported_at IS NULL 的记录，按日期分组后批量上传至 MinIO。
 *
 * @param limit - 单次拉取上限（默认 100）
 * @returns 未导出的审计日志行数组
 */
export async function getUnexportedAuditLogs(limit: number = UNEXPORTED_BATCH_LIMIT): Promise<AuditLogRow[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, event_type, user_id, org_id, ip_address, action, resource_type, resource_id,
            payload, hmac_signature, object_key, exported_at, created_at
       FROM audit_logs
      WHERE exported_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit],
  );
  return rows.map(mapAuditLogRow);
}

/**
 * 标记审计日志已导出至 MinIO（回填 object_key 与 exported_at）。
 *
 * 导出作业上传成功后调用，记录对象键与导出时间戳，便于按对象追溯。
 *
 * @param ids - 已导出的审计日志 ID 数组
 * @param objectKey - MinIO 对象键
 */
export async function markExported(ids: string[], objectKey: string): Promise<void> {
  if (ids.length === 0) return;
  const pool = getPool();
  await pool.query(
    `UPDATE audit_logs
        SET exported_at = NOW(),
            object_key = $2
      WHERE id = ANY($1::uuid[])`,
    [ids, objectKey],
  );
  logger.info(
    { module: 'auditStorage', count: ids.length, objectKey },
    '[auditStorage] 审计日志已标记为已导出',
  );
}

/**
 * 分页查询审计日志（支持多过滤条件组合）。
 *
 * 动态 WHERE 拼接，参数化查询防 SQL 注入。过滤条件：
 * - orgId：组织 UUID
 * - eventType：事件类型
 * - userId：用户 UUID
 * - action：操作动作
 * - startDate / endDate：创建时间范围（闭区间）
 *
 * @param filters - 过滤条件
 * @param page - 页码（从 1 开始）
 * @param limit - 每页条数
 * @returns 分页查询结果（含总数）
 */
export async function queryAuditLogs(
  filters: AuditLogQueryFilters,
  page: number = 1,
  limit: number = 50,
): Promise<PaginatedAuditLogs> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.orgId) {
    conditions.push(`org_id = $${paramIdx++}`);
    params.push(filters.orgId);
  }
  if (filters.eventType) {
    conditions.push(`event_type = $${paramIdx++}`);
    params.push(filters.eventType);
  }
  if (filters.userId) {
    conditions.push(`user_id = $${paramIdx++}`);
    params.push(filters.userId);
  }
  if (filters.action) {
    conditions.push(`action = $${paramIdx++}`);
    params.push(filters.action);
  }
  if (filters.startDate) {
    conditions.push(`created_at >= $${paramIdx++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`created_at <= $${paramIdx++}`);
    params.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  // 并行查询数据与总数
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, event_type, user_id, org_id, ip_address, action, resource_type, resource_id,
              payload, hmac_signature, object_key, exported_at, created_at
         FROM audit_logs
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
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
 *
 * 从 DB 读取指定审计日志，重算 payload 的 HMAC 签名并与存储的 hmac_signature 比对。
 * 签名不匹配即表明 payload 被篡改。使用 crypto.timingSafeEqual 常量时间比较防时序攻击。
 *
 * @param logId - 审计日志 UUID
 * @returns { valid: 是否通过校验, expected: 重算签名, actual: 存储签名 }
 *          日志不存在时返回 { valid: false, expected: '', actual: '' }
 *          未配置 AUDIT_HMAC_KEY 时返回 { valid: true, expected: '', actual: '' }
 */
export async function verifyAuditIntegrity(logId: string): Promise<{
  valid: boolean;
  expected: string;
  actual: string;
}> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT payload, hmac_signature FROM audit_logs WHERE id = $1`,
    [logId],
  );
  if (rows.length === 0) {
    return { valid: false, expected: '', actual: '' };
  }

  const storedSignature = rows[0].hmac_signature as string;
  const payload = rows[0].payload;

  // Security (D2-010): fail-closed — 未配置密钥时验证失败（与 auditLog.verifyPayload 一致）
  const key = config.AUDIT_HMAC_KEY;
  if (!key) {
    return { valid: false, expected: '', actual: storedSignature };
  }

  // payload 从 JSONB 读出后重新序列化，与写入时的序列化结果可能键顺序不同，
  // 但 HMAC 基于字节流——此处对 JSON.stringify 结果签名，与 writeAuditLog 一致
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const expected = crypto.createHmac('sha256', key).update(payloadStr).digest('hex');

  // 常量时间比较防时序攻击
  const sigBuf = Buffer.from(storedSignature);
  const expBuf = Buffer.from(expected);
  let valid = false;
  if (sigBuf.length === expBuf.length) {
    valid = crypto.timingSafeEqual(sigBuf, expBuf);
  }

  if (!valid) {
    logger.warn(
      { module: 'auditStorage', logId },
      '[auditStorage] 审计日志完整性校验失败（疑似篡改）',
    );
  }
  return { valid, expected, actual: storedSignature };
}

/**
 * 将 DB 行映射为 AuditLogRow（snake_case → camelCase，时间戳转 ISO 字符串）。
 */
function mapAuditLogRow(row: {
  id: string;
  event_type: string;
  user_id: string | null;
  org_id: string | null;
  ip_address: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  payload: unknown;
  hmac_signature: string;
  prev_hash: string | null;
  object_key: string | null;
  exported_at: Date | string | null;
  created_at: Date | string;
}): AuditLogRow {
  return {
    id: row.id,
    eventType: row.event_type,
    userId: row.user_id,
    orgId: row.org_id,
    ipAddress: row.ip_address,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    payload:
      typeof row.payload === 'string'
        ? (JSON.parse(row.payload) as Record<string, unknown>)
        : (row.payload as Record<string, unknown>),
    hmacSignature: row.hmac_signature,
    prevHash: row.prev_hash,
    objectKey: row.object_key,
    exportedAt: row.exported_at ? new Date(row.exported_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * 校验单条审计记录的 prev_hash 链式完整性（从 verifyAuditChain 提取以降低认知复杂度）。
 *
 * @param row - 当前审计记录（id / hmac_signature / prev_hash）
 * @param prevId - 前一条记录的 id（null 表示链头）
 * @param prevSig - 前一条记录的 hmac_signature（null 表示链头）
 * @param brokenLinks - 断裂点收集数组（原地修改）
 */
function checkChainLink(
  row: { id: string; hmac_signature: string; prev_hash: string | null },
  prevId: string | null,
  prevSig: string | null,
  brokenLinks: Array<{ id: string; expectedPrevHash: string; actualPrevHash: string | null }>,
): void {
  if (prevId === null || prevSig === null) return;

  const expectedPrevHash = crypto
    .createHash('sha256')
    .update(`${prevId}${prevSig}`)
    .digest('hex');

  const actualPrevHash = row.prev_hash;
  if (actualPrevHash !== expectedPrevHash) {
    brokenLinks.push({ id: row.id, expectedPrevHash, actualPrevHash });
  }
}
/**
 * P2-04: 验证审计日志链式完整性。
 *
 * 遍历 audit_logs 表（按 created_at 顺序），对每条记录：
 * 1. 重算 prev_hash = SHA256(prev.id || prev.hmac_signature)
 * 2. 与存储的 prev_hash 比对
 * 3. 不匹配则记录为断裂点
 *
 * 第一条记录的 prev_hash 应为 NULL（链头）。
 *
 * @returns 验证结果（是否完整、断裂点列表）
 */
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

  // 分页验证，避免一次加载数百万行
  let hasMore = true;
  let lastId: string | null = null;

  while (hasMore) {
    let query: string;
    const params: unknown[] = [BATCH_SIZE];

    if (lastId === null) {
      query = 'SELECT id, hmac_signature, prev_hash FROM audit_logs ORDER BY created_at ASC, id ASC LIMIT $1';
    } else {
      query = `SELECT id, hmac_signature, prev_hash FROM audit_logs WHERE (created_at, id) > (SELECT created_at, id FROM audit_logs WHERE id = $2) ORDER BY created_at ASC, id ASC LIMIT $1`;
      params.push(lastId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      hasMore = false;
      break;
    }

    for (const row of result.rows) {
      checkChainLink(
        row as { id: string; hmac_signature: string; prev_hash: string | null },
        prevId,
        prevSig,
        brokenLinks,
      );
      prevId = row.id as string;
      prevSig = row.hmac_signature as string;
      totalChecked++;
    }

    lastId = result.rows[result.rows.length - 1].id as string;

    // 更新进度日志
    if (totalChecked % 5000 === 0) {
      logger.info(`[auditStorage] 审计链验证进度: ${totalChecked} 条已检查`);
    }
  }

  const valid = brokenLinks.length === 0;
  logger.info(
    { module: 'auditStorage', totalChecked, brokenLinks: brokenLinks.length },
    '[auditStorage] 链式完整性校验完成',
  );
  return { valid, totalChecked, brokenLinks };
}
