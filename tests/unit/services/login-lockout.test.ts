import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRedisModuleMock } from '../../helpers/mockFactories.js';

const redisMocks = vi.hoisted(() => ({}));
const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () =>
  createRedisModuleMock(
    {
      withMemoryHelpers: true,
      memoryFallbackErrorMessage: 'Redis unavailable',
      methods: { ttl: vi.fn(), incr: vi.fn() },
    },
    redisMocks,
  ),
);

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: dbMocks.query }),
  withTenant: async (_orgId: string, fn: (client: { query: typeof dbMocks.query }) => unknown) =>
    fn({ query: dbMocks.query }),
}));

import {
  isLockedOut,
  recordFailure,
  clearFailures,
  isIpBlocked,
  recordIpFailure,
  checkLoginRestriction,
} from '../../../packages/backend/src/application/auth/loginLockout.js';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../../../packages/backend/src/repositories/apiKeyRepo.js';
import { verifyApiKey } from '../../../packages/backend/src/infrastructure/apiKeyVerifier.js';
import { createHash } from 'node:crypto';

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

const ORG = '11111111-1111-1111-1111-111111111111';
const KEY_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => vi.clearAllMocks());

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: KEY_ID,
    org_id: ORG,
    name: 'CI key',
    key_prefix: 'bpk_live_abcd',
    created_by: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    last_used_at: null,
    revoked_at: null,
    is_platform_admin: false,
    expires_at: null,
    ...overrides,
  };
}

function failOnce(n: number) {
  redisMocks.incr.mockResolvedValueOnce(n);
  redisMocks.expire.mockResolvedValueOnce(1);
}

describe('loginLockout', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    redisMocks.useRedisSuccess();
  });

  it.each<[string, (key: string) => Promise<number>, string, number, number]>([
    ['账户未锁定 isLockedOut 返回 0', isLockedOut, 'User@Example.com', -2, 0],
    ['账户锁定中 isLockedOut 返回剩余秒数', isLockedOut, 'alice', 120, 120],
    ['IP 未封锁时 isIpBlocked 返回 0', isIpBlocked, '192.168.1.1', -2, 0],
    ['IP 封锁中 isIpBlocked 返回剩余秒数', isIpBlocked, '10.0.0.1', 3600, 3600],
  ])('%s', async (_n, fn, key, ttlVal, expected) => {
    redisMocks.ttl.mockResolvedValueOnce(ttlVal);
    await expect(fn(key)).resolves.toBe(expected);
  });
  it('空 IP 时 isIpBlocked 应返回 0', async () => {
    await expect(isIpBlocked('')).resolves.toBe(0);
  });

  it('连续失败达阈值应锁定账户', async () => {
    failOnce(5);
    redisMocks.set.mockResolvedValueOnce('OK');
    redisMocks.del.mockResolvedValueOnce(1);

    await recordFailure('bob');
    expect(redisMocks.set).toHaveBeenCalled();
  });

  it('clearFailures 应清除计数与锁定', async () => {
    redisMocks.del.mockResolvedValueOnce(2);
    await clearFailures('carol');
    expect(redisMocks.del).toHaveBeenCalled();
  });

  it('首次失败应设置过期时间', async () => {
    failOnce(1);
    await recordFailure('eve');
    expect(redisMocks.expire).toHaveBeenCalled();
  });

  it.each([
    ['clearFailures', clearFailures, 'frank'],
    ['recordFailure', recordFailure, 'dave'],
  ] as const)('Redis 不可用时 %s 应抛出 RedisUnavailableError（ADR-045）', async (_n, fn, key) => {
    redisMocks.useMemoryFallback();
    await expect(fn(key)).rejects.toThrow('Redis unavailable');
  });

  it('空 IP 时 recordIpFailure 应跳过', async () => {
    await recordIpFailure('');
    expect(redisMocks.incr).not.toHaveBeenCalled();
  });

  it('IP 失败达阈值应封锁 IP（SHA-256 哈希键）', async () => {
    failOnce(10);
    redisMocks.set.mockResolvedValueOnce('OK');
    redisMocks.del.mockResolvedValueOnce(1);
    await recordIpFailure('203.0.113.5');
    expect(redisMocks.set).toHaveBeenCalledWith(
      'login_ip_lock:' + hashIp('203.0.113.5'),
      '1',
      'EX',
      3600,
    );
  });

  it('IP 首次失败应设置过期时间（SHA-256 哈希键）', async () => {
    failOnce(1);
    await recordIpFailure('203.0.113.5');
    expect(redisMocks.expire).toHaveBeenCalledWith('login_ip_fail:' + hashIp('203.0.113.5'), 300);
  });

  it('同一 IP 多次失败后应触发封锁（跨账号撞库场景）', async () => {
    for (let i = 1; i <= 10; i++) {
      failOnce(i);
      if (i >= 10) {
        redisMocks.set.mockResolvedValueOnce('OK');
        redisMocks.del.mockResolvedValueOnce(1);
      }
      await recordIpFailure('198.51.100.1');
    }
    expect(redisMocks.set).toHaveBeenCalledWith(
      'login_ip_lock:' + hashIp('198.51.100.1'),
      '1',
      'EX',
      3600,
    );
  });

  it('不同 IP 的失败计数独立（不互相影响）', async () => {
    failOnce(1);
    await recordIpFailure('1.1.1.1');

    failOnce(1);
    await recordIpFailure('2.2.2.2');

    const expireCalls = redisMocks.expire.mock.calls;
    expect(expireCalls[0][0]).toBe('login_ip_fail:' + hashIp('1.1.1.1'));
    expect(expireCalls[1][0]).toBe('login_ip_fail:' + hashIp('2.2.2.2'));
    expect(expireCalls[0][0]).not.toBe(expireCalls[1][0]);
  });

  it.each<[string, number, number, { locked: boolean; reason: string; ttlSec: number }]>([
    [
      '账户锁定时返回 account_locked',
      600,
      -2,
      { locked: true, reason: 'account_locked', ttlSec: 600 },
    ],
    ['IP 封锁时返回 ip_blocked', -2, 1800, { locked: true, reason: 'ip_blocked', ttlSec: 1800 }],
    ['未受限时返回 locked=false', -2, -2, { locked: false, reason: '', ttlSec: 0 }],
  ])('checkLoginRestriction %s', async (_n, userTtl, ipTtl, expected) => {
    redisMocks.ttl.mockResolvedValueOnce(userTtl);
    redisMocks.ttl.mockResolvedValueOnce(ipTtl);
    const result = await checkLoginRestriction('alice', '1.2.3.4');
    expect(result).toEqual(expected);
  });
});

describe('createApiKey', () => {
  it('应返回一次性明文密钥且形态为 bpk_live_*', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [dbRow()] });
    const created = await createApiKey(ORG, 'CI key', null);

    expect(created.plaintext).toMatch(/^bpk_live_[A-Za-z0-9_-]+$/);
    expect(created.id).toBe(KEY_ID);
    expect(created.orgId).toBe(ORG);

    // 关键安全断言：写入 DB 的是哈希而非明文
    // P0-04 后 INSERT 参数顺序：org_id, name, key_hash(sha256), key_hash_argon2, key_prefix, created_by
    const [, params] = dbMocks.query.mock.calls[0];
    const keyHash = params[2] as string;
    const keyHashArgon2 = params[3] as string;
    const keyPrefix = params[4] as string;
    expect(keyHash).not.toContain(created.plaintext);
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(keyHashArgon2).not.toContain(created.plaintext);
    expect(keyHashArgon2).toMatch(/^\$argon2id\$/);
    expect(created.plaintext.startsWith(keyPrefix)).toBe(true);
  });
});

describe('verifyApiKey', () => {
  it.each([
    ['非 bpk_live_ 前缀应直接拒绝（不查询 DB）', 'not-a-valid-key'],
    ['超长密钥应直接拒绝', 'bpk_live_' + 'a'.repeat(200)],
  ])('%s', async (_label, key) => {
    const result = await verifyApiKey(key);
    expect(result).toBeNull();
    expect(dbMocks.query).not.toHaveBeenCalled();
  });

  it('未命中（无有效行）应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const result = await verifyApiKey('bpk_live_validlookingkey');
    expect(result).toBeNull();
  });

  it('命中应返回 orgId/keyId 并异步更新 last_used_at', async () => {
    dbMocks.query
      .mockResolvedValueOnce({ rows: [{ id: KEY_ID, org_id: ORG }] }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE last_used_at
    const result = await verifyApiKey('bpk_live_validlookingkey');
    expect(result).toEqual({ orgId: ORG, keyId: KEY_ID });
    await new Promise((r) => setTimeout(r, 5));
    expect(dbMocks.query).toHaveBeenCalledTimes(2);
  });
});

describe('listApiKeys', () => {
  it('应映射数据库行为 ApiKeyRecord（不含明文/哈希）', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [dbRow()] });
    const keys = await listApiKeys(ORG);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ id: KEY_ID, orgId: ORG, keyPrefix: 'bpk_live_abcd' });
    expect((keys[0] as Record<string, unknown>).plaintext).toBeUndefined();
  });
});

describe('revokeApiKey', () => {
  it.each([
    ['成功吊销应返回 true', 1, true],
    ['不存在/不属于本组织/已吊销应返回 false', 0, false],
  ])('%s', async (_label, rowCount, expected) => {
    dbMocks.query.mockResolvedValueOnce({ rowCount });
    expect(await revokeApiKey(ORG, KEY_ID)).toBe(expected);
  });

  it('吊销应以 org_id 收敛防跨租户', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    await revokeApiKey(ORG, KEY_ID);
    const [sql, params] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('org_id = $2');
    expect(params).toEqual([KEY_ID, ORG]);
  });
});
