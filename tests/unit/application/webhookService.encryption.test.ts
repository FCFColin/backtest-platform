import { describe, it, expect, vi, beforeEach } from 'vitest';

// 固定 KEK，避免依赖 .env（任意字符串，内部经 sha256 派生为 32 字节密钥）
const TEST_KEK = 'test-webhook-kek-32bytes-string-pad';
const WRONG_KEK = 'wrong-kek-completely-different-string!!';

const poolMocks = vi.hoisted(() => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
  return { pool };
});
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks.pool),
  withTenant: vi.fn(async (_orgId: string, fn: (client: typeof poolMocks.pool) => Promise<void>) => fn(poolMocks.pool)),
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

const ssrfMock = vi.hoisted(() => ({ assertSafeUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../packages/backend/src/utils/ssrfGuard.js', () => ({
  assertSafeUrl: ssrfMock.assertSafeUrl,
}));

import {
  encrypt,
  decrypt,
  type EncryptedPayload,
} from '../../../packages/backend/src/utils/crypto.js';
import {
  createWebhook,
  processPendingDeliveries,
} from '../../../packages/backend/src/application/webhookService.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const ENDPOINT_ID = '00000000-0000-0000-0000-000000000002';
const DELIVERY_ID = '00000000-0000-0000-0000-000000000003';
const PLAINTEXT_SECRET = 'super-secret-webhook-signing-key-99';
const URL = 'https://example.com/webhook';

describe('envelopeEncryption (standalone encrypt/decrypt)', () => {
  beforeEach(() => {
    vi.stubEnv('WEBHOOK_SECRET_KEK', TEST_KEK);
  });

  it('encrypt → decrypt 应还原原始明文', async () => {
    const enc = await encrypt(PLAINTEXT_SECRET, TEST_KEK);
    const dec = await decrypt(enc, TEST_KEK);
    expect(dec).toBe(PLAINTEXT_SECRET);
  });

  it('encrypt 应返回 Buffer 形式的 ciphertext/iv/tag 与字符串 kid', async () => {
    const enc = await encrypt(PLAINTEXT_SECRET, TEST_KEK);
    expect(Buffer.isBuffer(enc.ciphertext)).toBe(true);
    expect(Buffer.isBuffer(enc.iv)).toBe(true);
    expect(Buffer.isBuffer(enc.tag)).toBe(true);
    expect(typeof enc.kid).toBe('string');
    expect(enc.kid.length).toBeGreaterThan(0);
  });

  it('encrypt 同一明文每次产生不同密文（随机 IV）', async () => {
    const a = await encrypt(PLAINTEXT_SECRET, TEST_KEK);
    const b = await encrypt(PLAINTEXT_SECRET, TEST_KEK);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it('decrypt 用错误 KEK 应抛错（GCM 认证失败）', async () => {
    const enc = await encrypt(PLAINTEXT_SECRET, TEST_KEK);
    await expect(decrypt(enc, WRONG_KEK)).rejects.toThrow();
  });

  it('decrypt 篡改 ciphertext 应抛错（认证失败）', async () => {
    const enc = await encrypt(PLAINTEXT_SECRET, TEST_KEK);
    const tampered: EncryptedPayload = {
      ...enc,
      ciphertext: Buffer.concat([enc.ciphertext, Buffer.from('tamper')]),
    };
    await expect(decrypt(tampered, TEST_KEK)).rejects.toThrow();
  });
});

describe('createWebhook (C-024 加密存储)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WEBHOOK_SECRET_KEK', TEST_KEK);
  });

  it('应在 INSERT 前加密 secret，存储 ciphertext/iv/tag/kid 而非明文', async () => {
    const insertReturnRow = {
      id: ENDPOINT_ID,
      url: URL,
      description: null,
      is_active: true,
      subscribed_events: ['backtest.completed'],
      created_at: new Date(),
    };
    const clientMock = { query: vi.fn().mockResolvedValueOnce({ rows: [insertReturnRow] }) };

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
    const args = call[1] as unknown[];
    // 参数顺序：org_id, url, secret(ciphertext), secret_iv, secret_tag, secret_kid, description, subscribed_events
    const storedSecret = args[2];
    const storedIv = args[3];
    const storedTag = args[4];
    const storedKid = args[5];

    expect(Buffer.isBuffer(storedSecret)).toBe(true);
    expect(Buffer.isBuffer(storedIv)).toBe(true);
    expect(Buffer.isBuffer(storedTag)).toBe(true);
    expect(typeof storedKid).toBe('string');
    expect(storedSecret.toString('utf8')).not.toBe(PLAINTEXT_SECRET);

    const decrypted = await decrypt(
      { ciphertext: storedSecret as Buffer, iv: storedIv as Buffer, tag: storedTag as Buffer, kid: storedKid as string },
      TEST_KEK,
    );
    expect(decrypted).toBe(PLAINTEXT_SECRET);

    expect((created as Record<string, unknown>).secret).toBeUndefined();
  });
});

describe('processPendingDeliveries (C-024 解密签名)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WEBHOOK_SECRET_KEK', TEST_KEK);
    fetchMock.mockReset();
    ssrfMock.assertSafeUrl.mockResolvedValue(undefined);
    poolMocks.pool.query.mockResolvedValue({ rows: [] });
  });

  it('应从 DB 读出密文 secret 并 decrypt 为明文用于 HMAC 签名', async () => {
    const enc = await encrypt(PLAINTEXT_SECRET, TEST_KEK);
    const dbRow = {
      delivery_id: DELIVERY_ID,
      endpoint_id: ENDPOINT_ID,
      event_type: 'BacktestCompleted',
      payload: { runId: 'r1' },
      attempt_count: 0,
      url: URL,
      secret: enc.ciphertext,
      secret_iv: enc.iv,
      secret_tag: enc.tag,
      secret_kid: enc.kid,
      org_id: ORG_ID,
    };
    poolMocks.pool.query.mockResolvedValueOnce({ rows: [dbRow] });
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });

    await processPendingDeliveries();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    const body = (call[1] as { body: string }).body;
    const headers = (call[1] as { headers: Record<string, string> }).headers;
    const sigHeader = headers['X-Webhook-Signature'];
     
    const crypto = await import('crypto');
    const expectedSig = 'sha256=' + crypto.createHmac('sha256', PLAINTEXT_SECRET).update(body).digest('hex');
    expect(sigHeader).toBe(expectedSig);
  });
});
