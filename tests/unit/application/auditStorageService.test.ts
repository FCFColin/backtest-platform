import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PoolClient } from 'pg';
import crypto from 'crypto';
const poolMocks = vi.hoisted(() => ({ pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } }));
const poolClient = poolMocks.pool as unknown as PoolClient;
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks.pool),
  withPlatformContext: vi.fn((fn) => fn(poolMocks.pool)),
}));
const minioMocks = vi.hoisted(() => ({
  ensureBucketExists: vi.fn().mockResolvedValue(undefined),
  uploadAuditObject: vi.fn().mockResolvedValue(true),
  isMinioConfigured: vi.fn(() => true),
}));
vi.mock('../../../packages/backend/src/infrastructure/minioStorage.js', () => minioMocks);
import { config } from '../../../packages/backend/src/config/index.js';
import {
  signAuditEntry,
  writeAuditLog,
  getUnexportedAuditLogs,
  markExported,
  verifyAuditIntegrity,
  type AuditLogEntry,
} from '../../../packages/backend/src/application/auditStorageService.js';
import { exportPendingAuditLogs } from '../../../packages/backend/src/application/auditExporter.js';
const TEST_KEY = 'test-audit-hmac-key-very-secret-32bytes';
const LOG_ID = '00000000-0000-0000-0000-000000000001';
const ORG_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000020';
const str = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
const hmac = (v: unknown) => crypto.createHmac('sha256', TEST_KEY).update(str(v)).digest('hex');
const q = poolMocks.pool.query;
const callSql = (i: number) => q.mock.calls[i][0] as string;
const callArgs = (i: number) => q.mock.calls[i][1] as unknown[];
const sqlFind = (s: string) => q.mock.calls.find((c) => String(c[0]).includes(s));
const onceRows = (...rows: unknown[][]) =>
  rows.forEach((r) => q.mockResolvedValueOnce({ rows: r }));
const queueExport = (payload: unknown, sig: string) => {
  q.mockResolvedValueOnce({ rows: [makeDbRow({ payload, hmac_signature: sig })] });
  q.mockResolvedValueOnce({ rows: [{ payload_text: str(payload), hmac_signature: sig }] });
};
function makeEntry(o: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    eventType: 'AuditEvent',
    userId: USER_ID,
    orgId: ORG_ID,
    ipAddress: '127.0.0.1',
    action: 'CREATE',
    resourceType: 'backtest_run',
    resourceId: 'run-1',
    payload: { method: 'POST', path: '/api/v1/backtest', statusCode: 200 },
    ...o,
  };
}
const makeDbRow = (o: Record<string, unknown> = {}) => ({
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
  ...o,
});
describe('auditStorageService', () => {
  let originalKey: string;
  beforeEach(() => {
    vi.clearAllMocks();
    q.mockResolvedValue({ rows: [] });
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
  describe('signAuditEntry', () => {
    it.each([
      ['应生成与独立 HMAC-SHA256 计算一致的签名', '{"event":"test"}'],
      ['签名应为 64 字符的十六进制字符串', 'test-payload'],
    ])('%s', (_n, payload) => {
      const sig = signAuditEntry(payload);
      expect(sig).toBe(hmac(payload));
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });
    it('不同 payload 应产生不同签名', () => {
      expect(signAuditEntry('{"a":1}')).not.toBe(signAuditEntry('{"a":2}'));
    });
    it('未配置 AUDIT_HMAC_KEY 时应返回空字符串', () => {
      config.AUDIT_HMAC_KEY = '';
      expect(signAuditEntry('test')).toBe('');
    });
  });
  describe('writeAuditLog', () => {
    it('应 INSERT 并回写 HMAC 签名（覆盖 jsonb 规范化后的精确字节）', async () => {
      const entry = makeEntry();
      const payloadText = JSON.stringify(entry.payload);
      onceRows([], [], [{ id: LOG_ID, payload: payloadText }], []);
      expect(await writeAuditLog(entry, poolClient)).toBe(LOG_ID);
      expect(callSql(2)).toContain('INSERT INTO audit_logs');
      expect(callSql(2)).toContain('RETURNING id, payload::text');
      const args = callArgs(2);
      expect(args[0]).toBe('AuditEvent');
      expect(args[1]).toBe(USER_ID);
      expect(args[4]).toBe('CREATE');
      expect(args[8]).toBe('');
      const update = sqlFind('UPDATE audit_logs SET hmac_signature');
      expect(update).toBeDefined();
      expect(update![1][1]).toBe(hmac(payloadText));
      expect(update![1][2]).toBeNull();
    });
    it('可选字段为 null 时应传 null 而非 undefined', async () => {
      onceRows([], [], [{ id: LOG_ID, payload: '{}' }], []);
      await writeAuditLog(
        makeEntry({ userId: null, orgId: null, resourceType: null, resourceId: null }),
        poolClient,
      );
      const args = callArgs(2);
      expect(args[1]).toBeNull();
      expect(args[2]).toBeNull();
      expect(args[5]).toBeNull();
      expect(args[6]).toBeNull();
    });
    it('重复 outbox 投递冲突时应返回已有 id（幂等，不重复插入）', async () => {
      onceRows([], [], [], [{ id: LOG_ID }]);
      const result = await writeAuditLog(makeEntry(), poolClient, 'outbox-1');
      expect(result).toBe(LOG_ID);
      expect(q.mock.calls[2][0]).toContain('ON CONFLICT (outbox_event_id)');
      expect(q.mock.calls.some((c) => String(c[0]).includes('UPDATE audit_logs'))).toBe(false);
    });
    it('P0 回归：jsonb 键序规范化后签名仍可验证（写读字节一致）', async () => {
      const canonicalText =
        '{"method":"POST","result":"ok","timestamp":"2026-07-25T10:00:00Z","userAgent":"ua","statusCode":200}';
      onceRows([], [], [{ id: LOG_ID, payload: canonicalText }], []);
      expect(await writeAuditLog(makeEntry(), poolClient)).toBe(LOG_ID);
      expect(sqlFind('UPDATE audit_logs SET hmac_signature')![1][1]).toBe(hmac(canonicalText));
      onceRows([{ payload_text: canonicalText, hmac_signature: hmac(canonicalText) }]);
      expect((await verifyAuditIntegrity(LOG_ID)).valid).toBe(true);
    });
  });
  describe('getUnexportedAuditLogs', () => {
    it('应查询 exported_at IS NULL 的记录（按 created_at 正序）', async () => {
      q.mockResolvedValueOnce({ rows: [makeDbRow()] });
      expect(await getUnexportedAuditLogs(50)).toHaveLength(1);
      expect(callSql(0)).toContain('WHERE exported_at IS NULL');
      expect(callSql(0)).toContain('ORDER BY created_at ASC');
      expect(callArgs(0)[0]).toBe(50);
    });
    it.each([100, 50])('默认/自定义 limit 应正确传递（limit=%i）', async (limit) => {
      q.mockResolvedValueOnce({ rows: [] });
      await getUnexportedAuditLogs(limit === 100 ? undefined : limit);
      expect(callArgs(0)[0]).toBe(limit);
    });
    it('DB 行应正确映射为 camelCase + ISO 时间戳', async () => {
      q.mockResolvedValueOnce({
        rows: [
          makeDbRow({
            exported_at: new Date('2026-07-25T12:00:00Z'),
            object_key: 'audit/2026/07/25/batch.jsonl',
          }),
        ],
      });
      const log = (await getUnexportedAuditLogs())[0];
      expect(log).toMatchObject({
        eventType: 'AuditEvent',
        orgId: ORG_ID,
        hmacSignature: '',
        objectKey: 'audit/2026/07/25/batch.jsonl',
      });
      expect(log.exportedAt).toBe('2026-07-25T12:00:00.000Z');
      expect(log.createdAt).toBe('2026-07-25T10:00:00.000Z');
    });
  });
  describe('markExported', () => {
    it('应 UPDATE exported_at + object_key（使用 ANY 数组）', async () => {
      const ids = [LOG_ID, '00000000-0000-0000-0000-000000000002'];
      const objectKey = 'audit/2026/07/25/batch.jsonl';
      await markExported(ids, objectKey);
      const sql = callSql(0);
      const params = callArgs(0);
      expect(sql).toContain('UPDATE audit_logs');
      expect(sql).toContain('exported_at = NOW()');
      expect(sql).toContain('object_key = $2');
      expect(sql).toContain('id = ANY($1::uuid[])');
      expect(params[0]).toBe(ids);
      expect(params[1]).toBe(objectKey);
    });
    it('空 ID 数组应直接返回（不调用 query）', async () => {
      await markExported([], 'audit/key');
      expect(q).not.toHaveBeenCalled();
    });
  });
  describe('verifyAuditIntegrity', () => {
    const VALID_PAYLOAD = { method: 'POST', path: '/api/v1/backtest' };
    it.each([
      ['有效签名应返回 valid=true', VALID_PAYLOAD, hmac(VALID_PAYLOAD), true],
      [
        '篡改 payload 后应返回 valid=false',
        { method: 'DELETE', path: '/api/v1/admin/keys/xxx' },
        hmac(VALID_PAYLOAD),
        false,
      ],
      ['篡改 hmac_signature 后应返回 valid=false', { method: 'POST' }, 'a'.repeat(64), false],
    ])('%s', async (_n, payload, sig, valid) => {
      onceRows([{ payload_text: str(payload), hmac_signature: sig }]);
      expect((await verifyAuditIntegrity(LOG_ID)).valid).toBe(valid);
    });
    it('日志不存在时应返回 valid=false + 空签名', async () => {
      q.mockResolvedValueOnce({ rows: [] });
      expect(await verifyAuditIntegrity(LOG_ID)).toMatchObject({
        valid: false,
        expected: '',
        actual: '',
      });
    });
    it('未配置 AUDIT_HMAC_KEY 时应返回 valid=false（fail-closed，D2-010）', async () => {
      config.AUDIT_HMAC_KEY = '';
      onceRows([{ payload_text: '{"a":1}', hmac_signature: 'some-sig' }]);
      expect(await verifyAuditIntegrity(LOG_ID)).toMatchObject({ valid: false, expected: '' });
    });
  });
  describe('exportPendingAuditLogs', () => {
    it('无待导出记录时应返回空结果', async () => {
      q.mockResolvedValueOnce({ rows: [] });
      const result = await exportPendingAuditLogs();
      expect(result).toMatchObject({ processed: 0, exported: 0, skipped: 0 });
      expect(result.objectKeys).toHaveLength(0);
    });
    it('MinIO 未配置时应跳过导出（fail-closed）', async () => {
      minioMocks.isMinioConfigured.mockReturnValue(false);
      q.mockResolvedValueOnce({ rows: [makeDbRow()] });
      const result = await exportPendingAuditLogs();
      expect(result).toMatchObject({ processed: 1, exported: 0, minioConfigured: false });
      expect(minioMocks.ensureBucketExists).not.toHaveBeenCalled();
      expect(minioMocks.uploadAuditObject).not.toHaveBeenCalled();
    });
    it('MinIO 已配置时应上传 JSONL 并标记已导出', async () => {
      const payload = { method: 'POST' };
      const signature = hmac(payload);
      queueExport(payload, signature);
      const result = await exportPendingAuditLogs();
      expect(result).toMatchObject({ processed: 1, exported: 1, skipped: 0 });
      expect(result.objectKeys).toHaveLength(1);
      expect(result.objectKeys[0]).toMatch(/^audit\/2026\/07\/25\/[0-9a-f-]+\.jsonl$/);
      expect(minioMocks.ensureBucketExists).toHaveBeenCalledTimes(1);
      expect(minioMocks.uploadAuditObject).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(
        (minioMocks.uploadAuditObject.mock.calls[0][1] as string).split('\n')[0],
      );
      expect(parsed).toMatchObject({
        id: LOG_ID,
        eventType: 'AuditEvent',
        hmacSignature: signature,
      });
      expect(sqlFind('UPDATE audit_logs')).toBeDefined();
      expect(sqlFind('UPDATE audit_logs')![0]).toContain('exported_at = NOW()');
    });
    it('HMAC 校验失败的记录应被跳过（不写入 WORM）', async () => {
      const payload = { method: 'POST' };
      queueExport(payload, 'b'.repeat(64));
      const result = await exportPendingAuditLogs();
      expect(result).toMatchObject({ processed: 1, skipped: 1, exported: 0 });
      expect(minioMocks.uploadAuditObject).not.toHaveBeenCalled();
    });
    it('上传失败时不应标记已导出（下次重试）', async () => {
      const payload = { method: 'POST' };
      minioMocks.uploadAuditObject.mockResolvedValue(false);
      queueExport(payload, hmac(payload));
      const result = await exportPendingAuditLogs();
      expect(result.exported).toBe(0);
      expect(sqlFind('UPDATE audit_logs')).toBeUndefined();
    });
  });
});
