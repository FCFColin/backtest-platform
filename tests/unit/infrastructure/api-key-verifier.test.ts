import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));
const redisMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
const cryptoMocks = vi.hoisted(() => ({
  sha256Hex: vi.fn((s: string) => `sha256:${s}`),
  verifyApiKeyArgon2id: vi.fn(),
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: dbMocks.query }),
  withTenant: async (_orgId: string, fn: (client: { query: typeof dbMocks.query }) => unknown) =>
    fn({ query: dbMocks.query }),
}));

vi.mock('../../../packages/backend/src/repositories/apiKeyRepo.js', () => ({
  KEY_PREFIX: 'bpk_live_',
  PLATFORM_ADMIN_KEY_MAX_TTL_DAYS: 90,
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisMocks,
}));

vi.mock('../../../packages/backend/src/utils/redisFallback.js', () => ({
  requireRedis: (_key: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../../packages/backend/src/utils/crypto.js', () => cryptoMocks);

import {
  verifyApiKey,
  markApiKeyRevoked,
} from '../../../packages/backend/src/infrastructure/apiKeyVerifier.js';

const KEY_ID = '22222222-2222-2222-2222-222222222222';
const ORG = '11111111-1111-1111-1111-111111111111';

function selectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: KEY_ID,
    org_id: ORG,
    is_platform_admin: false,
    key_hash_argon2: null,
    ...overrides,
  };
}

describe('verifyApiKey - Redis 吊销缓存（立即生效层）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.get.mockResolvedValue(null);
    cryptoMocks.verifyApiKeyArgon2id.mockResolvedValue(true);
    dbMocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('DB 命中但 Redis 吊销缓存标记已吊销时应拒绝', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [selectRow()] });
    redisMocks.get.mockResolvedValue('1');

    const result = await verifyApiKey('bpk_live_validkey');
    expect(result).toBeNull();
  });

  it('Redis 不可用（抛错）时降级为仅 DB 校验，不应拒绝', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [selectRow()] });
    redisMocks.get.mockRejectedValueOnce(new Error('redis down'));

    const result = await verifyApiKey('bpk_live_validkey');
    expect(result).toEqual({ orgId: ORG, keyId: KEY_ID, isPlatformAdmin: false });
  });

  it('新密钥 argon2id 校验失败应拒绝', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [selectRow({ key_hash_argon2: '$argon2id$...' })],
    });
    cryptoMocks.verifyApiKeyArgon2id.mockResolvedValueOnce(false);

    const result = await verifyApiKey('bpk_live_validkey');
    expect(result).toBeNull();
    expect(cryptoMocks.verifyApiKeyArgon2id).toHaveBeenCalledWith(
      '$argon2id$...',
      'bpk_live_validkey',
    );
  });

  it('新密钥 argon2id 校验通过时返回平台管理员上下文', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [selectRow({ key_hash_argon2: '$argon2id$...', is_platform_admin: true })],
    });
    cryptoMocks.verifyApiKeyArgon2id.mockResolvedValueOnce(true);

    const result = await verifyApiKey('bpk_live_validkey');
    expect(result).toEqual({ orgId: ORG, keyId: KEY_ID, isPlatformAdmin: true });
  });
});

describe('markApiKeyRevoked', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应写入带 TTL 的吊销标记', async () => {
    redisMocks.set.mockResolvedValue('OK');
    await markApiKeyRevoked(KEY_ID);
    expect(redisMocks.set).toHaveBeenCalledWith(
      `apikey:revoked:${KEY_ID}`,
      '1',
      'EX',
      90 * 24 * 3600,
    );
  });

  it('Redis 不可用时降级为仅 DB revoked_at，不抛错', async () => {
    redisMocks.set.mockRejectedValueOnce(new Error('redis down'));
    await expect(markApiKeyRevoked(KEY_ID)).resolves.toBeUndefined();
  });
});
