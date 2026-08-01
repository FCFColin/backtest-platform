import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

const redisMocks = vi.hoisted(() => {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    ping: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    emit(event: string) {
      for (const h of handlers[event] ?? []) h();
    },
    ttl: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    useRedisSuccess() {
      redisMocks.ping.mockResolvedValue('PONG');
      redisMocks.emit('ready');
    },
    useMemoryFallback() {
      redisMocks.ping.mockRejectedValue(new Error('Redis not available'));
      redisMocks.emit('error');
    },
    loggerMocks: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    },
  };
});

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisMocks,
  getRedisHealth: vi.fn(async () => {
    try {
      return (await redisMocks.ping()) === 'PONG';
    } catch {
      return false;
    }
  }),
  markRedisUnhealthy: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(redisMocks.loggerMocks),
}));

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

describe('loginLockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
  });

  it('未锁定时 isLockedOut 返回 0', async () => {
    redisMocks.ttl.mockResolvedValueOnce(-2);
    await expect(isLockedOut('User@Example.com')).resolves.toBe(0);
  });

  it('锁定中 isLockedOut 返回剩余秒数', async () => {
    redisMocks.ttl.mockResolvedValueOnce(120);
    await expect(isLockedOut('alice')).resolves.toBe(120);
  });

  it('连续失败达阈值应锁定账户', async () => {
    redisMocks.incr.mockResolvedValueOnce(5);
    redisMocks.expire.mockResolvedValueOnce(1);
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
    redisMocks.incr.mockResolvedValueOnce(1);
    redisMocks.expire.mockResolvedValueOnce(1);
    await recordFailure('eve');
    expect(redisMocks.expire).toHaveBeenCalled();
  });

  it('Redis 不可用时 clearFailures 应抛出 RedisUnavailableError（ADR-045）', async () => {
    redisMocks.useMemoryFallback();
    await expect(clearFailures('frank')).rejects.toThrow('Redis unavailable');
  });

  it('Redis 不可用时 recordFailure 应抛出 RedisUnavailableError（ADR-045）', async () => {
    redisMocks.useMemoryFallback();
    await expect(recordFailure('dave')).rejects.toThrow('Redis unavailable');
  });

  it('空 IP 时 isIpBlocked 应返回 0', async () => {
    await expect(isIpBlocked('')).resolves.toBe(0);
  });

  it('IP 未封锁时 isIpBlocked 返回 0', async () => {
    redisMocks.ttl.mockResolvedValueOnce(-2);
    await expect(isIpBlocked('192.168.1.1')).resolves.toBe(0);
  });

  it('IP 封锁中 isIpBlocked 返回剩余秒数', async () => {
    redisMocks.ttl.mockResolvedValueOnce(3600);
    await expect(isIpBlocked('10.0.0.1')).resolves.toBe(3600);
  });

  it('空 IP 时 recordIpFailure 应跳过', async () => {
    await recordIpFailure('');
    expect(redisMocks.incr).not.toHaveBeenCalled();
  });

  it('IP 失败达阈值应封锁 IP（SHA-256 哈希键）', async () => {
    redisMocks.incr.mockResolvedValueOnce(10);
    redisMocks.expire.mockResolvedValueOnce(1);
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
    redisMocks.incr.mockResolvedValueOnce(1);
    redisMocks.expire.mockResolvedValueOnce(1);
    await recordIpFailure('203.0.113.5');
    expect(redisMocks.expire).toHaveBeenCalledWith('login_ip_fail:' + hashIp('203.0.113.5'), 300);
  });

  it('同一 IP 多次失败后应触发封锁（跨账号撞库场景）', async () => {
    // 模拟 10 次失败（阈值为 10）
    for (let i = 1; i <= 10; i++) {
      redisMocks.incr.mockResolvedValueOnce(i);
      redisMocks.expire.mockResolvedValueOnce(1);
      if (i >= 10) {
        redisMocks.set.mockResolvedValueOnce('OK');
        redisMocks.del.mockResolvedValueOnce(1);
      }
      await recordIpFailure('198.51.100.1');
    }
    // 第 10 次时应设置封锁键
    expect(redisMocks.set).toHaveBeenCalledWith(
      'login_ip_lock:' + hashIp('198.51.100.1'),
      '1',
      'EX',
      3600,
    );
  });

  it('不同 IP 的失败计数独立（不互相影响）', async () => {
    redisMocks.incr.mockResolvedValueOnce(1);
    redisMocks.expire.mockResolvedValueOnce(1);
    await recordIpFailure('1.1.1.1');

    redisMocks.incr.mockResolvedValueOnce(1);
    redisMocks.expire.mockResolvedValueOnce(1);
    await recordIpFailure('2.2.2.2');

    // 两个不同 IP 的失败键应不同（哈希不同）
    const expireCalls = redisMocks.expire.mock.calls;
    expect(expireCalls[0][0]).toBe('login_ip_fail:' + hashIp('1.1.1.1'));
    expect(expireCalls[1][0]).toBe('login_ip_fail:' + hashIp('2.2.2.2'));
    expect(expireCalls[0][0]).not.toBe(expireCalls[1][0]);
  });

  it('checkLoginRestriction 账户锁定时应返回 account_locked', async () => {
    redisMocks.ttl.mockResolvedValueOnce(600); // user locked
    const result = await checkLoginRestriction('alice', '1.2.3.4');
    expect(result).toEqual({ locked: true, reason: 'account_locked', ttlSec: 600 });
  });

  it('checkLoginRestriction IP 封锁时应返回 ip_blocked', async () => {
    redisMocks.ttl.mockResolvedValueOnce(-2); // user not locked
    redisMocks.ttl.mockResolvedValueOnce(1800); // IP blocked
    const result = await checkLoginRestriction('alice', '1.2.3.4');
    expect(result).toEqual({ locked: true, reason: 'ip_blocked', ttlSec: 1800 });
  });

  it('checkLoginRestriction 未受限时应返回 locked=false', async () => {
    redisMocks.ttl.mockResolvedValueOnce(-2); // user not locked
    redisMocks.ttl.mockResolvedValueOnce(-2); // IP not blocked
    const result = await checkLoginRestriction('alice', '1.2.3.4');
    expect(result).toEqual({ locked: false, reason: '', ttlSec: 0 });
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
    // argon2id 编码哈希（P0-04/T6），与密码同策略，同样不含明文
    expect(keyHashArgon2).not.toContain(created.plaintext);
    expect(keyHashArgon2).toMatch(/^\$argon2id\$/);
    // key_prefix 是明文前缀，不含完整密钥
    expect(created.plaintext.startsWith(keyPrefix)).toBe(true);
  });
});

describe('verifyApiKey', () => {
  it('非 bpk_live_ 前缀应直接拒绝（不查询 DB）', async () => {
    const result = await verifyApiKey('not-a-valid-key');
    expect(result).toBeNull();
    expect(dbMocks.query).not.toHaveBeenCalled();
  });

  it('超长密钥应直接拒绝', async () => {
    const result = await verifyApiKey('bpk_live_' + 'a'.repeat(200));
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
    // 等待异步 UPDATE
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
  it('成功吊销应返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await revokeApiKey(ORG, KEY_ID)).toBe(true);
  });

  it('不存在/不属于本组织/已吊销应返回 false', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await revokeApiKey(ORG, KEY_ID)).toBe(false);
  });

  it('吊销应以 org_id 收敛防跨租户', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    await revokeApiKey(ORG, KEY_ID);
    const [sql, params] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('org_id = $2');
    expect(params).toEqual([KEY_ID, ORG]);
  });
});
