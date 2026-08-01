import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

const poolMocks = vi.hoisted(() => {
  const queryFn = vi.fn().mockResolvedValue({ rows: [] });
  return { pool: { query: queryFn } };
});
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks.pool),
  withTenant: vi.fn(
    async (_t: string, fn: (c: { query: typeof poolMocks.pool.query }) => Promise<void>) => {
      await fn({ query: poolMocks.pool.query });
    },
  ),
}));
const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);
const ssrfMock = vi.hoisted(() => ({ assertSafeUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../packages/backend/src/utils/ssrfGuard.js', () => ({
  assertSafeUrl: ssrfMock.assertSafeUrl,
}));
const envEncMock = vi.hoisted(() => ({
  encrypt: vi.fn().mockResolvedValue({
    ciphertext: Buffer.from('enc'),
    iv: Buffer.from('iv'),
    tag: Buffer.from('tag'),
    kid: 'default',
  }),
  decrypt: vi.fn(),
}));
vi.mock('../../../packages/backend/src/utils/crypto.js', () => ({
  encrypt: envEncMock.encrypt,
  decrypt: envEncMock.decrypt,
}));

import {
  signPayload,
  deliverWebhook,
  triggerWebhooks,
  processPendingDeliveries,
  cleanupOldDeliveries,
  WEBHOOK_CONSTANTS,
} from '../../../packages/backend/src/application/webhookService.js';
const { RETRY_DELAYS_MS, MAX_ATTEMPTS, AUTO_DISABLE_THRESHOLD, MAX_DELIVERIES_PER_ENDPOINT } =
  WEBHOOK_CONSTANTS;
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const ENDPOINT_ID = '00000000-0000-0000-0000-000000000002';
const DELIVERY_ID = '00000000-0000-0000-0000-000000000003';
const SECRET = 'test-secret-key-1234';
const URL = 'https://example.com/webhook';
const TEST_KEK = 'test-webhook-kek-32bytes-string-pad';
const WRONG_KEK = 'wrong-kek-completely-different-string!!';
const PLAINTEXT_SECRET = 'super-secret-webhook-signing-key-99';

function makeDeliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    delivery_id: DELIVERY_ID,
    endpoint_id: ENDPOINT_ID,
    event_type: 'BacktestCompleted',
    payload: { runId: 'run-1' },
    attempt_count: 0,
    url: URL,
    secret: Buffer.from('enc'),
    secret_iv: Buffer.from('iv'),
    secret_tag: Buffer.from('tag'),
    secret_kid: 'default',
    org_id: ORG_ID,
    ...overrides,
  };
}
const findCall = (frag: string) =>
  poolMocks.pool.query.mock.calls.find(
    (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes(frag),
  );
const okFetch = (body = 'ok') => ({ ok: true, status: 200, text: async () => body });
const errFetch = (status: number, body = '') => ({ ok: false, status, text: async () => body });
const runPendingDelivery = (overrides: Record<string, unknown>, fetchRes: unknown) => {
  poolMocks.pool.query.mockResolvedValueOnce({ rows: [makeDeliveryRow(overrides)] });
  fetchMock.mockResolvedValue(fetchRes);
  poolMocks.pool.query.mockResolvedValue({ rows: [] });
  return processPendingDeliveries();
};
describe('webhookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolMocks.pool.query.mockResolvedValue({ rows: [] });
    fetchMock.mockReset();
    ssrfMock.assertSafeUrl.mockResolvedValue(undefined);
    envEncMock.decrypt.mockResolvedValue(SECRET);
  });
  afterEach(() => vi.restoreAllMocks());
  describe('signPayload', () => {
    it('应生成与独立 HMAC-SHA256 计算一致的十六进制签名，且不同 secret 产生不同签名', () => {
      const payload = JSON.stringify({ event: 'BacktestCompleted' });
      expect(signPayload(payload, SECRET)).toBe(
        crypto.createHmac('sha256', SECRET).update(payload).digest('hex'),
      );
      expect(signPayload('{"a":1}', 'secret-a')).not.toBe(signPayload('{"a":1}', 'secret-b'));
    });
  });
  describe('deliverWebhook', () => {
    it.each([
      ['2xx', okFetch(), { success: true, code: 200, body: 'ok' }],
      ['5xx', errFetch(503, 'unavailable'), { success: false, code: 503, body: undefined }],
      ['网络错误/超时', null, { success: false, code: null, body: 'fetch failed' }],
    ])('%s 响应应返回预期结果', async (_n, mock, expected) => {
      if (mock) fetchMock.mockResolvedValue(mock);
      else fetchMock.mockRejectedValue(new Error('fetch failed'));
      const r = await deliverWebhook({ url: URL, secret: SECRET }, 'Test', { a: 1 });
      expect(r.success).toBe(expected.success);
      expect(r.responseCode).toBe(expected.code);
      if (expected.body) expect(r.responseBody).toContain(expected.body);
    });
    it('应设置 X-Webhook-Event/X-Webhook-Signature/X-Webhook-Timestamp 头且签名正确', async () => {
      fetchMock.mockResolvedValue(okFetch(''));
      await deliverWebhook({ url: URL, secret: SECRET }, 'BacktestCompleted', { runId: 'r1' });
      const init = fetchMock.mock.calls[0][1] as { body: string; headers: Record<string, string> };
      expect(init.headers['X-Webhook-Event']).toBe('BacktestCompleted');
      expect(init.headers['X-Webhook-Signature']).toMatch(/^sha256=[0-9a-f]+$/);
      expect(init.headers['X-Webhook-Signature']).toBe(
        'sha256=' + crypto.createHmac('sha256', SECRET).update(init.body).digest('hex'),
      );
      expect(init.headers['X-Webhook-Timestamp']).toMatch(/^\d+$/);
    });
    it('响应体应截断至 1000 字符', async () => {
      fetchMock.mockResolvedValue(okFetch('x'.repeat(2500)));
      expect(
        (await deliverWebhook({ url: URL, secret: SECRET }, 'Test', {})).responseBody.length,
      ).toBe(1000);
    });
    it('SSRF 校验失败返回 permanentFailure 且不调用 fetch；通过后正常调用 fetch（C-003）', async () => {
      ssrfMock.assertSafeUrl.mockRejectedValueOnce(new Error('SSRF blocked: private IP'));
      const r = await deliverWebhook({ url: URL, secret: SECRET }, 'Test', { a: 1 });
      expect(r.success).toBe(false);
      expect(r.responseCode).toBeNull();
      expect(r.permanentFailure).toBe(true);
      expect(r.responseBody).toContain('SSRF blocked');
      expect(fetchMock).not.toHaveBeenCalled();

      fetchMock.mockResolvedValue(okFetch());
      const ok = await deliverWebhook({ url: URL, secret: SECRET }, 'Test', { a: 1 });
      expect(ok.success).toBe(true);
      expect(ssrfMock.assertSafeUrl).toHaveBeenCalledWith(URL);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
  describe('triggerWebhooks', () => {
    it('无匹配订阅时应跳过 INSERT（仅探测查询）', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] });
      await triggerWebhooks(ORG_ID, 'BacktestCompleted', { runId: 'r1' });
      expect(poolMocks.pool.query).toHaveBeenCalledTimes(1);
      expect(poolMocks.pool.query.mock.calls[0][0] as string).toContain(
        'SELECT 1 FROM webhook_endpoints',
      );
    });
    it('有匹配订阅时应执行 INSERT...SELECT 创建 pending 投递（仅活跃端点）', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rowCount: 2 });
      await triggerWebhooks(ORG_ID, 'BacktestCompleted', { runId: 'r1' });
      expect(poolMocks.pool.query).toHaveBeenCalledTimes(2);
      const insertCall = poolMocks.pool.query.mock.calls[1];
      const sql = insertCall[0] as string;
      expect(sql).toContain('INSERT INTO webhook_deliveries');
      expect(sql).toContain("'pending'");
      expect(sql).toContain('org_id = $1');
      expect(sql).toContain('is_active = TRUE');
      expect(sql).toContain('= ANY(subscribed_events)');
      expect(insertCall[1]).toEqual([ORG_ID, 'BacktestCompleted', JSON.stringify({ runId: 'r1' })]);
    });
  });
  describe('processPendingDeliveries', () => {
    it('无待投递记录时应直接返回（不调用 fetch）', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] });
      await processPendingDeliveries();
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it('投递成功应标记 success 并重置端点 failed_consecutive_count=0', async () => {
      await runPendingDelivery({}, okFetch());
      const dSql = findCall('UPDATE webhook_deliveries')![0] as string;
      expect(dSql).toContain("status = 'success'");
      expect(dSql).toContain('delivered_at = NOW()');
      const eSql = findCall('UPDATE webhook_endpoints')![0] as string;
      expect(eSql).toContain('failed_consecutive_count = 0');
    });
    it('投递失败且未达上限应标记 retrying 并安排 next_retry_at（重试阶梯 1min/5min/30min/2h/24h）', async () => {
      expect(RETRY_DELAYS_MS).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 86_400_000]);
      expect(MAX_ATTEMPTS).toBe(5);
      const before = Date.now();
      await runPendingDelivery({ attempt_count: 0 }, errFetch(500, 'err'));
      const dUpdate = findCall('UPDATE webhook_deliveries')!;
      const dSql = dUpdate[0] as string;
      expect(dSql).toContain("status = 'retrying'");
      expect(dSql).toContain('next_retry_at = $4');
      const nextRetryAt = ((dUpdate[1] as unknown[])[3] as Date).getTime();
      expect(nextRetryAt).toBeGreaterThanOrEqual(before + RETRY_DELAYS_MS[0] - 1000);
      expect(nextRetryAt).toBeLessThanOrEqual(before + RETRY_DELAYS_MS[0] + 5000);
      expect(findCall('UPDATE webhook_endpoints')).toBeUndefined();
    });
    it('达到 MAX_ATTEMPTS 应标记 failed，连续失败达到阈值自动禁用端点（含未达阈值保活）', async () => {
      expect(AUTO_DISABLE_THRESHOLD).toBe(5);
      expect(MAX_DELIVERIES_PER_ENDPOINT).toBe(100);
      await runPendingDelivery({ attempt_count: MAX_ATTEMPTS - 1 }, errFetch(500));
      expect(findCall('UPDATE webhook_deliveries')![0] as string).toContain("status = 'failed'");
      const eUpdate = findCall('UPDATE webhook_endpoints')!;
      const eSql = eUpdate[0] as string;
      expect(eSql).toContain('failed_consecutive_count = failed_consecutive_count + 1');
      expect(eSql).toContain('is_active = CASE');
      expect(eSql).toContain('THEN FALSE');
      expect(eSql).toContain('disabled_at = CASE');
      expect(eSql).toContain('THEN NOW()');
      expect(eSql).toContain('ELSE is_active');
      expect((eUpdate[1] as unknown[])[1]).toBe(AUTO_DISABLE_THRESHOLD);
    });
  });
  describe('cleanupOldDeliveries', () => {
    it('应使用 ROW_NUMBER 窗口函数删除每端点超出上限的旧记录；无可清理记录时不记录日志', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rowCount: 7 });
      await cleanupOldDeliveries();
      const call = poolMocks.pool.query.mock.calls[0];
      const sql = call[0] as string;
      expect(sql).toContain('DELETE FROM webhook_deliveries');
      expect(sql).toContain('ROW_NUMBER()');
      expect(sql).toContain('PARTITION BY endpoint_id');
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(sql).toContain('rn > $1');
      expect(call[1]).toEqual([MAX_DELIVERIES_PER_ENDPOINT]);
      poolMocks.pool.query.mockResolvedValueOnce({ rowCount: 0 });
      await cleanupOldDeliveries();
      expect(poolMocks.pool.query).toHaveBeenCalledTimes(2);
    });
  });
});

// -- C-024：真实 crypto.js（而非上文 mock）经 vi.doUnmock + vi.resetModules + 动态 import 加载
describe('webhook encryption (C-024)', () => {
  let cryptoMod: typeof import('../../../packages/backend/src/utils/crypto.js');
  beforeEach(async () => {
    vi.stubEnv('WEBHOOK_SECRET_KEK', TEST_KEK);
    vi.doUnmock('../../../packages/backend/src/utils/crypto.js');
    vi.resetModules();
    cryptoMod = await import('../../../packages/backend/src/utils/crypto.js');
  });
  describe('envelopeEncryption (standalone encrypt/decrypt)', () => {
    const enc = () => cryptoMod.encrypt(PLAINTEXT_SECRET, TEST_KEK);
    it('encrypt → decrypt 应还原原始明文，且返回 Buffer 形式 ciphertext/iv/tag 与字符串 kid', async () => {
      const e = await enc();
      expect(await cryptoMod.decrypt(e, TEST_KEK)).toBe(PLAINTEXT_SECRET);
      expect(Buffer.isBuffer(e.ciphertext)).toBe(true);
      expect(Buffer.isBuffer(e.iv)).toBe(true);
      expect(Buffer.isBuffer(e.tag)).toBe(true);
      expect(typeof e.kid).toBe('string');
      expect(e.kid.length).toBeGreaterThan(0);
    });
    it('encrypt 同一明文每次产生不同密文（随机 IV）', async () => {
      const a = await enc();
      const b = await enc();
      expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
      expect(a.iv.equals(b.iv)).toBe(false);
    });
    it.each<
      [
        string,
        (
          e: Awaited<ReturnType<typeof cryptoMod.encrypt>>,
        ) => Awaited<ReturnType<typeof cryptoMod.encrypt>>,
        string,
      ]
    >([
      ['decrypt 用错误 KEK 应抛错（GCM 认证失败）', (e) => e, WRONG_KEK],
      [
        'decrypt 篡改 ciphertext 应抛错（认证失败）',
        (e) => ({ ...e, ciphertext: Buffer.concat([e.ciphertext, Buffer.from('tamper')]) }),
        TEST_KEK,
      ],
    ])('%s', async (_n, mutate, kek) => {
      await expect(cryptoMod.decrypt(mutate(await enc()), kek)).rejects.toThrow();
    });
  });
  describe('createWebhook (C-024 加密存储)', () => {
    beforeEach(() => vi.clearAllMocks());
    it('应在 INSERT 前加密 secret，存储 ciphertext/iv/tag/kid 而非明文', async () => {
      const { createWebhook } =
        await import('../../../packages/backend/src/application/webhookService.js');
      const clientMock = {
        query: vi.fn().mockResolvedValueOnce({
          rows: [
            {
              id: ENDPOINT_ID,
              url: URL,
              description: null,
              is_active: true,
              subscribed_events: ['backtest.completed'],
              created_at: new Date(),
            },
          ],
        }),
      };
      const created = await createWebhook(clientMock as never, {
        orgId: ORG_ID,
        url: URL,
        secret: PLAINTEXT_SECRET,
        subscribedEvents: ['backtest.completed'],
      });
      const call = clientMock.query.mock.calls[0];
      const sql = call[0] as string;
      expect(sql).toContain('INSERT INTO webhook_endpoints');
      expect(sql).toContain('secret_iv');
      expect(sql).toContain('secret_kid');
      // 参数顺序：org_id, url, secret(ciphertext), secret_iv, secret_tag, secret_kid, description, subscribed_events
      const args = call[1] as unknown[];
      const [storedSecret, storedIv, storedTag, storedKid] = [args[2], args[3], args[4], args[5]];
      expect(Buffer.isBuffer(storedSecret)).toBe(true);
      expect(Buffer.isBuffer(storedIv)).toBe(true);
      expect(Buffer.isBuffer(storedTag)).toBe(true);
      expect(typeof storedKid).toBe('string');
      expect(storedSecret.toString('utf8')).not.toBe(PLAINTEXT_SECRET);
      expect(
        await cryptoMod.decrypt(
          {
            ciphertext: storedSecret as Buffer,
            iv: storedIv as Buffer,
            tag: storedTag as Buffer,
            kid: storedKid as string,
          },
          TEST_KEK,
        ),
      ).toBe(PLAINTEXT_SECRET);
      expect((created as Record<string, unknown>).secret).toBeUndefined();
    });
  });
  describe('processPendingDeliveries (C-024 解密签名)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      fetchMock.mockReset();
      ssrfMock.assertSafeUrl.mockResolvedValue(undefined);
      poolMocks.pool.query.mockResolvedValue({ rows: [] });
    });
    it('应从 DB 读出密文 secret 并 decrypt 为明文用于 HMAC 签名', async () => {
      const { processPendingDeliveries } =
        await import('../../../packages/backend/src/application/webhookService.js');
      const enc = await cryptoMod.encrypt(PLAINTEXT_SECRET, TEST_KEK);
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [
          makeDeliveryRow({
            secret: enc.ciphertext,
            secret_iv: enc.iv,
            secret_tag: enc.tag,
            secret_kid: enc.kid,
          }),
        ],
      });
      fetchMock.mockResolvedValue(okFetch());
      await processPendingDeliveries();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0];
      const body = (call[1] as { body: string }).body;
      const headers = (call[1] as { headers: Record<string, string> }).headers;
      const expectedSig =
        'sha256=' + crypto.createHmac('sha256', PLAINTEXT_SECRET).update(body).digest('hex');
      expect(headers['X-Webhook-Signature']).toBe(expectedSig);
    });
  });
});
