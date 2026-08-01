import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
const poolMocks = vi.hoisted(() => ({ pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } }));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks.pool),
}));
const minioMocks = vi.hoisted(() => ({
  ensureBucketExists: vi.fn().mockResolvedValue(undefined),
  uploadAuditObject: vi.fn().mockResolvedValue(true),
  isMinioConfigured: vi.fn(() => true),
}));
vi.mock('../../../packages/backend/src/infrastructure/dataServices.js', () => ({
  ensureBucketExists: minioMocks.ensureBucketExists,
  uploadAuditObject: minioMocks.uploadAuditObject,
  isMinioConfigured: minioMocks.isMinioConfigured,
}));
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
const hmac = (p: unknown) =>
  crypto
    .createHmac('sha256', TEST_KEY)
    .update(typeof p === 'string' ? p : JSON.stringify(p))
    .digest('hex');
const callSql = (i: number) => poolMocks.pool.query.mock.calls[i][0] as string;
const callArgs = (i: number) => poolMocks.pool.query.mock.calls[i][1] as unknown[];
const findUpdateCall = () =>
  poolMocks.pool.query.mock.calls.find(
    (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE audit_logs'),
  );
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
function makeDbRow(o: Record<string, unknown> = {}) {
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
    ...o,
  };
}
function setupExport(payload: unknown, sig: string) {
  poolMocks.pool.query.mockResolvedValueOnce({
    rows: [makeDbRow({ payload, hmac_signature: sig })],
  });
  poolMocks.pool.query.mockResolvedValueOnce({ rows: [{ payload, hmac_signature: sig }] });
  poolMocks.pool.query.mockResolvedValue({ rows: [] });
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
    it('应 INSERT 审计日志并返回 ID（含 HMAC 签名）', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: LOG_ID }] });
      const entry = makeEntry();
      expect(await writeAuditLog(entry)).toBe(LOG_ID);
      expect(callSql(1)).toContain('INSERT INTO audit_logs');
      expect(callSql(1)).toContain('RETURNING id');
      const args = callArgs(1);
      expect(args[0]).toBe('AuditEvent');
      expect(args[1]).toBe(USER_ID);
      expect(args[4]).toBe('CREATE');
      expect(args[8]).toBe(hmac(entry.payload));
    });
    it('可选字段为 null 时应传 null 而非 undefined', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: LOG_ID }] });
      await writeAuditLog(
        makeEntry({ userId: null, orgId: null, resourceType: null, resourceId: null }),
      );
      const args = callArgs(1);
      expect(args[1]).toBeNull();
      expect(args[2]).toBeNull();
      expect(args[5]).toBeNull();
      expect(args[6]).toBeNull();
    });
    it('应使用连接池（未传 client 时）', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: LOG_ID }] });
      await writeAuditLog(makeEntry());
      expect(poolMocks.pool.query).toHaveBeenCalledTimes(2);
    });
  });
  describe('getUnexportedAuditLogs', () => {
    it('应查询 exported_at IS NULL 的记录（按 created_at 正序）', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [makeDbRow()] });
      expect(await getUnexportedAuditLogs(50)).toHaveLength(1);
      expect(callSql(0)).toContain('WHERE exported_at IS NULL');
      expect(callSql(0)).toContain('ORDER BY created_at ASC');
      expect(callArgs(0)[0]).toBe(50);
    });
    it.each([100, 50])('默认/自定义 limit 应正确传递（limit=%i）', async (limit) => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] });
      await getUnexportedAuditLogs(limit === 100 ? undefined : limit);
      expect(callArgs(0)[0]).toBe(limit);
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
      expect(poolMocks.pool.query).not.toHaveBeenCalled();
    });
  });
  describe('queryAuditLogs', () => {
    it('无过滤条件时应查询全部（无 WHERE 子句）', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [makeDbRow()] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const result = await queryAuditLogs({}, 1, 50);
      expect(result).toMatchObject({ total: 1, page: 1, limit: 50 });
      expect(result.logs).toHaveLength(1);
      expect(callSql(0)).not.toContain('WHERE');
      expect(callSql(0)).toContain('ORDER BY created_at DESC');
      expect(callSql(0)).toContain('LIMIT');
      expect(callSql(0)).toContain('OFFSET');
    });
    it.each([
      ['org_id', { orgId: ORG_ID }, 'org_id = $1', [ORG_ID]],
      [
        '多过滤条件组合',
        {
          orgId: ORG_ID,
          eventType: 'AuditEvent',
          userId: USER_ID,
          action: 'CREATE',
          startDate: '2026-07-01',
          endDate: '2026-07-31',
        },
        'org_id = $1',
        [ORG_ID],
      ],
    ])('应支持 %s 过滤', async (_n, filter, expectedSql) => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });
      await queryAuditLogs(filter);
      expect(callSql(0)).toContain(expectedSql);
    });
    it('分页应正确计算 OFFSET（page=3, limit=20 → offset=40）', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] });
      const result = await queryAuditLogs({}, 3, 20);
      expect(result).toMatchObject({ page: 3, limit: 20 });
      const params = callArgs(0);
      expect(params[params.length - 2]).toBe(20);
      expect(params[params.length - 1]).toBe(40);
    });
    it('总数查询应使用相同的 WHERE 条件', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] });
      await queryAuditLogs({ orgId: ORG_ID });
      const countSql = callSql(1);
      expect(countSql).toContain('SELECT COUNT(*)');
      expect(countSql).toContain('WHERE');
      expect(countSql).toContain('org_id = $1');
    });
  });
  describe('verifyAuditIntegrity', () => {
    it.each([
      {
        name: '有效签名应返回 valid=true',
        payload: { method: 'POST', path: '/api/v1/backtest' },
        sigFn: (p: unknown) => hmac(p),
        valid: true,
      },
      {
        name: '篡改 payload 后应返回 valid=false',
        payload: { method: 'DELETE', path: '/api/v1/admin/keys/xxx' },
        sigFn: () => hmac({ method: 'POST', path: '/api/v1/backtest' }),
        valid: false,
      },
      {
        name: '篡改 hmac_signature 后应返回 valid=false',
        payload: { method: 'POST' },
        sigFn: () => 'a'.repeat(64),
        valid: false,
      },
    ])('$name', async ({ payload, sigFn, valid }) => {
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload, hmac_signature: sigFn(payload) }],
      });
      expect((await verifyAuditIntegrity(LOG_ID)).valid).toBe(valid);
    });
    it('日志不存在时应返回 valid=false + 空签名', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] });
      expect(await verifyAuditIntegrity(LOG_ID)).toMatchObject({
        valid: false,
        expected: '',
        actual: '',
      });
    });
    it('未配置 AUDIT_HMAC_KEY 时应返回 valid=false（fail-closed，D2-010）', async () => {
      config.AUDIT_HMAC_KEY = '';
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload: { a: 1 }, hmac_signature: 'some-sig' }],
      });
      expect(await verifyAuditIntegrity(LOG_ID)).toMatchObject({ valid: false, expected: '' });
    });
  });
  describe('exportPendingAuditLogs', () => {
    it('无待导出记录时应返回空结果', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] });
      const result = await exportPendingAuditLogs();
      expect(result).toMatchObject({ processed: 0, exported: 0, skipped: 0 });
      expect(result.objectKeys).toHaveLength(0);
    });
    it('MinIO 未配置时应跳过导出（fail-closed）', async () => {
      minioMocks.isMinioConfigured.mockReturnValue(false);
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [makeDbRow()] });
      const result = await exportPendingAuditLogs();
      expect(result).toMatchObject({ processed: 1, exported: 0, minioConfigured: false });
      expect(minioMocks.ensureBucketExists).not.toHaveBeenCalled();
      expect(minioMocks.uploadAuditObject).not.toHaveBeenCalled();
    });
    it('MinIO 已配置时应上传 JSONL 并标记已导出', async () => {
      const payload = { method: 'POST' };
      const signature = hmac(payload);
      setupExport(payload, signature);
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
      expect(findUpdateCall()).toBeDefined();
      expect(findUpdateCall()![0] as string).toContain('exported_at = NOW()');
    });
    it('HMAC 校验失败的记录应被跳过（不写入 WORM）', async () => {
      const payload = { method: 'POST' };
      const tamperedSig = 'b'.repeat(64);
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [makeDbRow({ payload, hmac_signature: tamperedSig })],
      });
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload, hmac_signature: tamperedSig }],
      });
      const result = await exportPendingAuditLogs();
      expect(result).toMatchObject({ processed: 1, skipped: 1, exported: 0 });
      expect(minioMocks.uploadAuditObject).not.toHaveBeenCalled();
    });
    it('上传失败时不应标记已导出（下次重试）', async () => {
      const payload = { method: 'POST' };
      const signature = hmac(payload);
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [makeDbRow({ payload, hmac_signature: signature })],
      });
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [{ payload, hmac_signature: signature }],
      });
      minioMocks.uploadAuditObject.mockResolvedValue(false);
      const result = await exportPendingAuditLogs();
      expect(result.exported).toBe(0);
      expect(findUpdateCall()).toBeUndefined();
    });
  });
});
