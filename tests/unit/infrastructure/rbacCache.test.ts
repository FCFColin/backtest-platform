import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loggerMocks } from '../../helpers/loggerFixture.js';

const { redisStub, markUnhealthy, configMock } = vi.hoisted(() => {
  const store = new Map<string, string>();
  const redisStub = {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n++;
      return n;
    }),
    scan: vi.fn(async () => ['0', []]),
  };
  return {
    redisStub,
    markUnhealthy: vi.fn(),
    configMock: { RBAC_CACHE_TTL_SEC: 300 },
  };
});

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisStub,
  markRedisUnhealthy: markUnhealthy,
  isSentinelMode: false,
  bullmqConnectionOptions: {},
  redisConnection: {},
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({ config: configMock }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));

import {
  getCachedUserPermissions,
  setCachedUserPermissions,
  invalidateUserPermissions,
  invalidateOrgRolePermissions,
} from '../../../packages/backend/src/infrastructure/rbacCache.js';

const USER_ID = '22222222-2222-2222-2222-222222222222';
const ORG_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  redisStub.store.clear();
  vi.clearAllMocks();
  redisStub.get.mockImplementation(async (key: string) => store.get(key) ?? null);
  redisStub.set.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
    return 'OK';
  });
  redisStub.del.mockImplementation(async (...keys: string[]) => {
    let n = 0;
    for (const k of keys) if (store.delete(k)) n++;
    return n;
  });
  redisStub.scan.mockResolvedValue(['0', []]);
});

const store = redisStub.store;

describe('getCachedUserPermissions', () => {
  it('缓存命中时应返回权限数组', async () => {
    store.set(`rbac:user_perms:${USER_ID}`, JSON.stringify(['backtest:run', 'data:read']));
    const result = await getCachedUserPermissions(USER_ID);
    expect(result).toEqual(['backtest:run', 'data:read']);
  });

  it('缓存未命中时应返回 null', async () => {
    expect(await getCachedUserPermissions(USER_ID)).toBeNull();
  });

  it('Redis 异常时应返回 null 并标记不可用', async () => {
    redisStub.get.mockRejectedValueOnce(new Error('ECONNRESET'));
    const result = await getCachedUserPermissions(USER_ID);
    expect(result).toBeNull();
    expect(markUnhealthy).toHaveBeenCalled();
  });
});

describe('setCachedUserPermissions', () => {
  it('应将权限 JSON 写入 Redis 带 TTL', async () => {
    await setCachedUserPermissions(USER_ID, ['backtest:run']);
    expect(redisStub.set).toHaveBeenCalledWith(
      `rbac:user_perms:${USER_ID}`,
      JSON.stringify(['backtest:run']),
      'EX',
      300,
    );
  });

  it('空数组应存为 "[]"', async () => {
    await setCachedUserPermissions(USER_ID, []);
    expect(redisStub.set).toHaveBeenCalledWith(expect.any(String), '[]', 'EX', 300);
  });

  it('Redis 异常时应静默失败', async () => {
    redisStub.set.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(setCachedUserPermissions(USER_ID, ['x'])).resolves.toBeUndefined();
    expect(markUnhealthy).toHaveBeenCalled();
  });
});

describe('invalidateUserPermissions', () => {
  it('应删除用户权限缓存键', async () => {
    store.set(`rbac:user_perms:${USER_ID}`, '[]');
    await invalidateUserPermissions(USER_ID);
    expect(redisStub.del).toHaveBeenCalledWith(`rbac:user_perms:${USER_ID}`);
    expect(store.has(`rbac:user_perms:${USER_ID}`)).toBe(false);
  });

  it('Redis 异常时应静默失败', async () => {
    redisStub.del.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(invalidateUserPermissions(USER_ID)).resolves.toBeUndefined();
    expect(markUnhealthy).toHaveBeenCalled();
  });
});

describe('invalidateOrgRolePermissions', () => {
  it('应扫描并删除匹配的键', async () => {
    const keys = [`rbac:role_perms:${ORG_ID}:role-1`, `rbac:role_perms:${ORG_ID}:role-2`];
    redisStub.scan.mockResolvedValue(['0', keys]);
    await invalidateOrgRolePermissions(ORG_ID);
    expect(redisStub.scan).toHaveBeenCalledWith(
      '0',
      'MATCH',
      `rbac:role_perms:${ORG_ID}:*`,
      'COUNT',
      100,
    );
    expect(redisStub.del).toHaveBeenCalledWith(...keys);
  });

  it('多页扫描时应循环直到 cursor=0', async () => {
    redisStub.scan
      .mockResolvedValueOnce(['1', [`rbac:role_perms:${ORG_ID}:a`]])
      .mockResolvedValueOnce(['0', [`rbac:role_perms:${ORG_ID}:b`]]);
    await invalidateOrgRolePermissions(ORG_ID);
    expect(redisStub.scan).toHaveBeenCalledTimes(2);
    expect(redisStub.del).toHaveBeenNthCalledWith(1, `rbac:role_perms:${ORG_ID}:a`);
    expect(redisStub.del).toHaveBeenNthCalledWith(2, `rbac:role_perms:${ORG_ID}:b`);
  });

  it('Redis 异常时应静默失败', async () => {
    redisStub.scan.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(invalidateOrgRolePermissions(ORG_ID)).resolves.toBeUndefined();
    expect(markUnhealthy).toHaveBeenCalled();
  });
});
