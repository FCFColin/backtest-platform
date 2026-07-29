/**
 * 审计存储服务单元测试（P2-03 不可篡改审计存储）
 *
 * 覆盖：
 * - signAuditEntry：HMAC-SHA256 签名生成（确定性、密钥敏感、未配置密钥回退）
 * - writeAuditLog：INSERT 审计日志（含 HMAC 签名）
 * - getUnexportedAuditLogs：查询未导出记录
 * - markExported：回填 object_key + exported_at
 * - queryAuditLogs：多过滤条件组合 + 分页
 * - verifyAuditIntegrity：有效签名通过、篡改 payload 失败、日志不存在、未配置密钥
 * - exportPendingAuditLogs：导出批次（MinIO 已配置/未配置、HMAC 校验失败跳过）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Mock：pg pool（getPool 返回带 query 的 mock pool）
// ---------------------------------------------------------------------------
const poolMocks = vi.hoisted(() => {
  const pool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
  return { pool };
});

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks.pool),
}));

// ---------------------------------------------------------------------------
// Mock：MinIO 客户端（ensureBucketExists / uploadAuditObject / isMinioConfigured）
// ---------------------------------------------------------------------------
const minioMocks = vi.hoisted(() => ({
  ensureBucketExists: vi.fn().mockResolvedValue(undefined),
  uploadAuditObject: vi.fn().mockResolvedValue(true),
  isMinioConfigured: vi.fn(() => true),
}));

vi.mock('../../../packages/backend/src/infrastructure/minioClient.js', () => ({
  ensureBucketExists: minioMocks.ensureBucketExists,
  uploadAuditObject: minioMocks.uploadAuditObject,
  isMinioConfigured: minioMocks.isMinioConfigured,
}));

// ---------------------------------------------------------------------------
// 导入被测模块（在 mock 注册之后）
// ---------------------------------------------------------------------------
import { config } from '../../../packages/backend/src/config/index.js';
import {
  signAuditEntry,
  writeAuditLog,
  getUnexportedAuditLogs,
  markExported,
  queryAuditLogs,
  verifyAuditIntegrity,
  type AuditLogEntry,
} from '../../../packages/backend/src/application/auditStorageService.js';
import { exportPendingAuditLogs } from '../../../packages/backend/src/application/auditExporter.js';

const TEST_KEY = 'test-audit-hmac-key-very-secret-32bytes';
const LOG_ID = '00000000-0000-0000-0000-000000000001';
const ORG_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000020';

/** 构造审计日志写入入参 */
function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    eventType: 'AuditEvent',
    userId: USER_ID,
    orgId: ORG_ID,
    ipAddress: '127.0.0.1',
    action: 'CREATE',
    resourceType: 'backtest_run',
    resourceId: 'run-1',
    payload: { method: 'POST', path: '/api/v1/backtest', statusCode: 200 },
    ...overrides,
  };
}

/** 构造 DB 返回的审计日志行（getUnexportedAuditLogs / queryAuditLogs 返回） */
function makeDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LOG_ID,
    event_type: 'AuditEvent',
    user_id: USER_ID,
    org_id: ORG_ID,
    ip_address: '127.0.0.1',
    action: 'CREATE',
    resource_type: 'backtest_run',
    resource_id: 'run-1',
    payload: { method: 'POST', path: '/api/v1/backtest' },
    hmac_signature: '',
    object_key: null,
    exported_at: null,
    created_at: new Date('2026-07-25T10:00:00Z'),
    ...overrides,
  };
}

describe('auditStorageService', () => {
  let originalKey: string;

  beforeEach(() => {
    vi.clearAllMocks();
    poolMocks.pool.query.mockResolvedValue({ rows: [] });
    minioMocks.ensureBucketExists.mockResolvedValue(undefined);
    minioMocks.uploadAuditObject.mockResolvedValue(true);
    minioMocks.isMinioConfigured.mockReturnValue(true);
    originalKey = config.AUDIT_HMAC_KEY;
    config.AUDIT_HMAC_KEY = TEST_KEY;
  });

  afterEach(() => {
    config.AUDIT_HMAC_KEY = originalKey;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // signAuditEntry
  // =========================================================================
  describe('signAuditEntry', () => {
    it('应生成与独立 HMAC-SHA256 计算一致的十六进制签名', () => {
      const payload = JSON.stringify({ event: 'test' });
      const expected = crypto.createHmac('sha256', TEST_KEY).update(payload).digest('hex');
      expect(signAuditEntry(payload)).toBe(expected);
    });

    it('不同 payload 应产生不同签名', () => {
      expect(signAuditEntry('{"a":1}')).not.toBe(signAuditEntry('{"a":2}'));
    });

    it('未配置 AUDIT_HMAC_KEY 时应返回空字符串', () => {
      config.AUDIT_HMAC_KEY = '';
      expect(signAuditEntry('test')).toBe('');
    });

    it('签名应为 64 字符的十六进制字符串', () => {
      const sig = signAuditEntry('test-payload');
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // =========================================================================
  // writeAuditLog
  // =========================================================================
  describe('writeAuditLog', () => {
    it('应 INSERT 审计日志并返回 ID（含 HMAC 签名）', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: LOG_ID }] });
      const entry = makeEntry();
      const id = await writeAuditLog(entry);
      expect(id).toBe(LOG_ID);

      const call = poolMocks.pool.query.mock.calls[1];
      const sql = call[0] as string;
      expect(sql).toContain('INSERT INTO audit_logs');
      expect(sql).toContain('RETURNING id');
      // 参数：[eventType, userId, orgId, ipAddress, action, resourceType, resourceId, payloadStr, signature]
      const args = call[1] as unknown[];
      expect(args[0]).toBe('AuditEvent');
      expect(args[1]).toBe(USER_ID);
      expect(args[4]).toBe('CREATE');
      // payload 序列化后的 HMAC 签名应作为最后一个参数
      const payloadStr = JSON.stringify(entry.payload);
      const expectedSig = crypto.createHmac('sha256', TEST_KEY).update(payloadStr).digest('hex');
      expect(args[8]).toBe(expectedSig);
    });

    it('可选字段为 null 时应传 null 而非 undefined', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: LOG_ID }] });
      const entry = makeEntry({ userId: null, orgId: null, resourceType: null, resourceId: null });
      await writeAuditLog(entry);
      const args = poolMocks.pool.query.mock.calls[1][1] as unknown[];
      expect(args[1]).toBeNull();
      expect(args[2]).toBeNull();
      expect(args[5]).toBeNull();
      expect(args[6]).toBeNull();
    });

    it('应使用连接池（未传 client 时）', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: LOG_ID }] });
      await writeAuditLog(makeEntry());
      expect(poolMocks.pool.query).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // getUnexportedAuditLogs
  // =========================================================================
  describe('getUnexportedAuditLogs', () => {
    it('应查询 exported_at IS NULL 的记录（按 created_at 正序）', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [makeDbRow()] });
      const logs = await getUnexportedAuditLogs(50);
      expect(logs).toHaveLength(1);
      const [sql, params] = poolMocks.pool.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE exported_at IS NULL');
      expect(sql).toContain('ORDER BY created_at ASC');
      expect(params[0]).toBe(50);
    });

    it('默认 limit 应为 100', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] });
      await getUnexportedAuditLogs();
      const params = poolMocks.pool.query.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(100);
    });

    it('DB 行应正确映射为 camelCase + ISO 时间戳', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [
          makeDbRow({
            exported_at: new Date('2026-07-25T12:00:00Z'),
            object_key: 'audit/2026/07/25/batch.jsonl',
          }),
        ],
      });
      const logs = await getUnexportedAuditLogs();
      expect(logs[0].eventType).toBe('AuditEvent');
      expect(logs[0].orgId).toBe(ORG_ID);
      expect(logs[0].hmacSignature).toBe('');
      expect(logs[0].objectKey).toBe('audit/2026/07/25/batch.jsonl');
      expect(logs[0].exportedAt).toBe('2026-07-25T12:00:00.000Z');
      expect(logs[0].createdAt).toBe('2026-07-25T10:00:00.000Z');
    });
  });

  // =========================================================================
  // markExported
  // =========================================================================
  describe('markExported', () => {
    it('应 UPDATE exported_at + object_key（使用 ANY 数组）', async () => {
      const ids = [LOG_ID, '00000000-0000-0000-0000-000000000002'];
      const objectKey = 'audit/2026/07/25/batch.jsonl';
      await markExported(ids, objectKey);
      const [sql, params] = poolMocks.pool.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE audit_logs');
      expect(sql).toContain('exported_at = NOW()');
      expect(sql).toContain('object_key = $2');
      expect(sql).toContain('id = ANY($1::uuid[])');
      expect(params[0]).toBe(ids);
      expect(params[1]).toBe(objectKey);
    });

    it('空 ID 数组应直接返回（不调用 query）', async () => {
      await markExported([], 'audit/key');
      expect(poolMocks.pool.query).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // queryAuditLogs
  // =========================================================================
  describe('queryAuditLogs', () => {
    it('无过滤条件时应查询全部（无 WHERE 子句）', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [makeDbRow()] }) // 数据查询
        .mockResolvedValueOnce({ rows: [{ total: 1 }] }); // 总数查询
      const result = await queryAuditLogs({}, 1, 50);
      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);

      // 数据查询 SQL 不应包含 WHERE
      const dataSql = poolMocks.pool.query.mock.calls[0][0] as string;
      expect(dataSql).not.toContain('WHERE');
      expect(dataSql).toContain('ORDER BY created_at DESC');
      expect(dataSql).toContain('LIMIT');
      expect(dataSql).toContain('OFFSET');
    });

    it('应支持 org_id 过滤', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });
      await queryAuditLogs({ orgId: ORG_ID });
      const [sql, params] = poolMocks.pool.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('org_id = $1');
      expect(params[0]).toBe(ORG_ID);
    });

    it('应支持多过滤条件组合（org_id + event_type + action + 日期范围）', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });
      await queryAuditLogs({
        orgId: ORG_ID,
        eventType: 'AuditEvent',
        userId: USER_ID,
        action: 'CREATE',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      });
      const sql = poolMocks.pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('org_id = $1');
      expect(sql).toContain('event_type = $2');
      expect(sql).toContain('user_id = $3');
      expect(sql).toContain('action = $4');
      expect(sql).toContain('created_at >= $5');
      expect(sql).toContain('created_at <= $6');
    });

    it('分页应正确计算 OFFSET（page=3, limit=20 → offset=40）', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] });
      const result = await queryAuditLogs({}, 3, 20);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(20);
      // LIMIT 和 OFFSET 应为最后两个参数
      const params = poolMocks.pool.query.mock.calls[0][1] as unknown[];
      expect(params[params.length - 2]).toBe(20); // limit
      expect(params[params.length - 1]).toBe(40); // offset = (3-1)*20
    });

    it('总数查询应使用相同的 WHERE 条件', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] });
      await queryAuditLogs({ orgId: ORG_ID });
      const countSql = poolMocks.pool.query.mock.calls[1][0] as string;
      expect(countSql).toContain('SELECT COUNT(*)');
      expect(countSql).toContain('WHERE');
      expect(countSql).toContain('org_id = $1');
    });
  });

  // =========================================================================
  // verifyAuditIntegrity
  // =========================================================================
  describe('verifyAuditIntegrity', () => {
    it('有效签名应返回 valid=true', async () => {
      const payload = { method: 'POST', path: '/api/v1/backtest' };
      const payloadStr = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', TEST_KEY).update(payloadStr).digest('hex');
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload, hmac_signature: signature }],
      });

      const result = await verifyAuditIntegrity(LOG_ID);
      expect(result.valid).toBe(true);
      expect(result.expected).toBe(signature);
      expect(result.actual).toBe(signature);
    });

    it('篡改 payload 后应返回 valid=false（签名不匹配）', async () => {
      const originalPayload = { method: 'POST', path: '/api/v1/backtest' };
      const originalSig = crypto
        .createHmac('sha256', TEST_KEY)
        .update(JSON.stringify(originalPayload))
        .digest('hex');
      // DB 中 payload 已被篡改
      const tamperedPayload = { method: 'DELETE', path: '/api/v1/admin/keys/xxx' };
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload: tamperedPayload, hmac_signature: originalSig }],
      });

      const result = await verifyAuditIntegrity(LOG_ID);
      expect(result.valid).toBe(false);
      expect(result.actual).toBe(originalSig);
      // expected 应为篡改后 payload 的新签名（与存储的 originalSig 不同）
      expect(result.expected).not.toBe(originalSig);
    });

    it('篡改 hmac_signature 后应返回 valid=false', async () => {
      const payload = { method: 'POST' };
      const payloadStr = JSON.stringify(payload);
      const correctSig = crypto.createHmac('sha256', TEST_KEY).update(payloadStr).digest('hex');
      const fakeSig = 'a'.repeat(64); // 伪造签名
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload, hmac_signature: fakeSig }],
      });

      const result = await verifyAuditIntegrity(LOG_ID);
      expect(result.valid).toBe(false);
      expect(result.actual).toBe(fakeSig);
      expect(result.expected).toBe(correctSig);
    });

    it('日志不存在时应返回 valid=false + 空签名', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] });
      const result = await verifyAuditIntegrity(LOG_ID);
      expect(result.valid).toBe(false);
      expect(result.expected).toBe('');
      expect(result.actual).toBe('');
    });

    it('未配置 AUDIT_HMAC_KEY 时应返回 valid=false（fail-closed，D2-010）', async () => {
      config.AUDIT_HMAC_KEY = '';
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload: { a: 1 }, hmac_signature: 'some-sig' }],
      });
      const result = await verifyAuditIntegrity(LOG_ID);
      expect(result.valid).toBe(false);
      expect(result.expected).toBe('');
    });
  });

  // =========================================================================
  // exportPendingAuditLogs
  // =========================================================================
  describe('exportPendingAuditLogs', () => {
    it('无待导出记录时应返回空结果', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] }); // getUnexportedAuditLogs
      const result = await exportPendingAuditLogs();
      expect(result.processed).toBe(0);
      expect(result.exported).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.objectKeys).toHaveLength(0);
    });

    it('MinIO 未配置时应跳过导出（fail-closed）', async () => {
      minioMocks.isMinioConfigured.mockReturnValue(false);
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [makeDbRow()] });
      const result = await exportPendingAuditLogs();
      expect(result.processed).toBe(1);
      expect(result.exported).toBe(0);
      expect(result.minioConfigured).toBe(false);
      expect(minioMocks.ensureBucketExists).not.toHaveBeenCalled();
      expect(minioMocks.uploadAuditObject).not.toHaveBeenCalled();
    });

    it('MinIO 已配置时应上传 JSONL 并标记已导出', async () => {
      const payload = { method: 'POST' };
      const payloadStr = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', TEST_KEY).update(payloadStr).digest('hex');
      const row = makeDbRow({ payload, hmac_signature: signature });
      // getUnexportedAuditLogs 返回 1 条
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [row] });
      // verifyAuditIntegrity 的 SELECT 查询
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload, hmac_signature: signature }],
      });
      // markExported 的 UPDATE
      poolMocks.pool.query.mockResolvedValue({ rows: [] });

      const result = await exportPendingAuditLogs();
      expect(result.processed).toBe(1);
      expect(result.exported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.objectKeys).toHaveLength(1);
      expect(result.objectKeys[0]).toMatch(/^audit\/2026\/07\/25\/[0-9a-f-]+\.jsonl$/);

      // 应调用 ensureBucketExists + uploadAuditObject
      expect(minioMocks.ensureBucketExists).toHaveBeenCalledTimes(1);
      expect(minioMocks.uploadAuditObject).toHaveBeenCalledTimes(1);

      // uploadAuditObject 的第二个参数应为 JSONL 字符串（每行一个 JSON 对象）
      const uploadArgs = minioMocks.uploadAuditObject.mock.calls[0];
      const jsonl = uploadArgs[1] as string;
      const lines = jsonl.split('\n');
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.id).toBe(LOG_ID);
      expect(parsed.eventType).toBe('AuditEvent');
      expect(parsed.hmacSignature).toBe(signature);

      // markExported 应执行 UPDATE（含 id = ANY）
      const markCall = poolMocks.pool.query.mock.calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && (c[0] as string).includes('UPDATE audit_logs'),
      );
      expect(markCall).toBeDefined();
      const markSql = markCall![0] as string;
      expect(markSql).toContain('exported_at = NOW()');
    });

    it('HMAC 校验失败的记录应被跳过（不写入 WORM）', async () => {
      const payload = { method: 'POST' };
      // DB 中签名已被篡改
      const tamperedSig = 'b'.repeat(64);
      const row = makeDbRow({ payload, hmac_signature: tamperedSig });
      // getUnexportedAuditLogs 返回 1 条
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [row] });
      // verifyAuditIntegrity 返回篡改后的 payload + 篡改签名 → 校验失败
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload, hmac_signature: tamperedSig }],
      });

      const result = await exportPendingAuditLogs();
      expect(result.processed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.exported).toBe(0);
      expect(minioMocks.uploadAuditObject).not.toHaveBeenCalled();
    });

    it('上传失败时不应标记已导出（下次重试）', async () => {
      const payload = { method: 'POST' };
      const payloadStr = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', TEST_KEY).update(payloadStr).digest('hex');
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [makeDbRow({ payload, hmac_signature: signature })],
      });
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload, hmac_signature: signature }],
      });
      minioMocks.uploadAuditObject.mockResolvedValue(false);

      const result = await exportPendingAuditLogs();
      expect(result.exported).toBe(0);
      // 不应执行 markExported 的 UPDATE
      const markCall = poolMocks.pool.query.mock.calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && (c[0] as string).includes('UPDATE audit_logs'),
      );
      expect(markCall).toBeUndefined();
    });
  });
});
