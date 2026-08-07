import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const poolMocks = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  const primaryPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
    query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    waitingCount: 0,
    totalCount: 2,
  };
  const readPoolInstance = {
    connect: vi.fn().mockResolvedValue(mockClient),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    waitingCount: 0,
    totalCount: 1,
  };
  return { mockClient, primaryPool, readPoolInstance, Pool: vi.fn() };
});

const configMocks = vi.hoisted(() => ({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  DATABASE_READ_URL: '',
  DB_POOL_MAX: 10,
  DB_POOL_MIN: 1,
  DB_STATEMENT_TIMEOUT_MS: 10000,
  NODE_ENV: 'test' as string,
  MIGRATIONS_DIR: 'migrations',
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({ config: configMocks }));

import { loggerMocks } from '../../helpers/loggerFixture.js';

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));

vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  registerPgPoolMetrics: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { readFileSync: vi.fn(() => '-- migration sql') },
  readFileSync: vi.fn(() => '-- migration sql'),
}));

vi.mock('pg', () => {
  poolMocks.Pool.mockImplementation((opts: { connectionString?: string }) => {
    if (opts.connectionString?.includes('read-replica')) {
      return poolMocks.readPoolInstance;
    }
    return poolMocks.primaryPool;
  });
  return { default: { Pool: poolMocks.Pool } };
});

const POOL_MODULE = '../../../packages/backend/src/db/pool.js';

describe('db/pool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    configMocks.DATABASE_READ_URL = '';
    configMocks.NODE_ENV = 'test';
    vi.resetModules();
    poolMocks.primaryPool.connect.mockResolvedValue(poolMocks.mockClient);
    poolMocks.mockClient.query.mockResolvedValue({ rows: [] });
    poolMocks.primaryPool.query.mockResolvedValue({ rows: [{ ok: 1 }], rowCount: 1 });
  });

  afterEach(() => {
    configMocks.NODE_ENV = 'test';
    configMocks.DATABASE_READ_URL = '';
  });

  it('getPool 应返回单例并注册 connect/error 处理器', async () => {
    const { getPool } = await import(POOL_MODULE);
    const p1 = getPool();
    const p2 = getPool();
    expect(p1).toBe(p2);
    expect(poolMocks.Pool).toHaveBeenCalledTimes(1);
    expect(poolMocks.primaryPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(poolMocks.primaryPool.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('未配置 DATABASE_READ_URL 时 getReadPool 应回退主池', async () => {
    const { getPool, getReadPool } = await import(POOL_MODULE);
    expect(getReadPool()).toBe(getPool());
    expect(poolMocks.Pool).toHaveBeenCalledTimes(1);
  });

  it('配置 DATABASE_READ_URL 时应创建独立只读池', async () => {
    configMocks.DATABASE_READ_URL = 'postgresql://read-replica/db';
    const { getReadPool } = await import(POOL_MODULE);
    const read = getReadPool();
    expect(read).toBe(poolMocks.readPoolInstance);
    expect(poolMocks.Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: 'postgresql://read-replica/db' }),
    );
  });

  it('pool connect 事件应设置 statement_timeout', async () => {
    const { getPool } = await import(POOL_MODULE);
    getPool();
    const connectHandler = poolMocks.primaryPool.on.mock.calls.find(
      (c) => c[0] === 'connect',
    )?.[1] as ((client: typeof poolMocks.mockClient) => void) | undefined;
    expect(connectHandler).toBeDefined();
    connectHandler!(poolMocks.mockClient);
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('SET statement_timeout'),
    );
  });

  it('生产环境应启用 SSL 配置', async () => {
    configMocks.NODE_ENV = 'production';
    vi.resetModules();
    const { getPool } = await import(POOL_MODULE);
    getPool();
    expect(poolMocks.Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: true } }),
    );
  });

  it('withTenant 应在主池上注入租户上下文', async () => {
    const { withTenant } = await import(POOL_MODULE);
    const result = await withTenant('00000000-0000-0000-0000-000000000001', async () => {
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(poolMocks.primaryPool.connect).toHaveBeenCalled();
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith(
      "SELECT set_config('app.current_tenant_id', $1, true)",
      ['00000000-0000-0000-0000-000000000001'],
    );
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('withTenant 非法 UUID 应抛出', async () => {
    const { withTenant } = await import(POOL_MODULE);
    await expect(withTenant('not-a-uuid', async () => 'ok')).rejects.toThrow(/非法 tenantId/);
  });

  it('withTenantReadOnly 应使用 readPool 注入租户上下文', async () => {
    configMocks.DATABASE_READ_URL = 'postgresql://read:read@read-replica:5432/test';
    vi.resetModules();
    const { withTenantReadOnly } = await import(POOL_MODULE);
    const result = await withTenantReadOnly(
      '00000000-0000-0000-0000-000000000002',
      async () => 'readonly-ok',
    );
    expect(result).toBe('readonly-ok');
    expect(poolMocks.readPoolInstance.connect).toHaveBeenCalled();
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('withTenantReadOnly 非法 UUID 应抛出', async () => {
    configMocks.DATABASE_READ_URL = 'postgresql://read:read@read-replica:5432/test';
    vi.resetModules();
    const { withTenantReadOnly } = await import(POOL_MODULE);
    await expect(withTenantReadOnly('bad', async () => 'ok')).rejects.toThrow(/非法 tenantId/);
  });

  it('withTenantReadOnly 回调失败应 ROLLBACK', async () => {
    configMocks.DATABASE_READ_URL = 'postgresql://read:read@read-replica:5432/test';
    vi.resetModules();
    poolMocks.mockClient.query.mockImplementationOnce(() => Promise.resolve({ rows: [] })); // BEGIN
    poolMocks.mockClient.query.mockImplementationOnce(() => Promise.resolve({ rows: [] })); // set_config
    poolMocks.mockClient.query.mockImplementationOnce(() => Promise.reject(new Error('boom'))); // fn
    poolMocks.mockClient.query.mockImplementationOnce(() => Promise.resolve({ rows: [] })); // ROLLBACK
    const { withTenantReadOnly } = await import(POOL_MODULE);
    await expect(
      withTenantReadOnly('00000000-0000-0000-0000-000000000003', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});

describe('db/migrations', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    poolMocks.mockClient.query.mockResolvedValue({ rows: [] });
  });

  it('initSchema 在无待迁移时应跳过', async () => {
    poolMocks.mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [{ version: 1 }] }); // applied versions
    const { initSchema } = await import('../../../packages/backend/src/db/migrations.js');
    await expect(initSchema()).resolves.toBeUndefined();
    expect(poolMocks.mockClient.release).toHaveBeenCalled();
  });

  it('initSchema 有待执行迁移时应执行 up SQL', async () => {
    poolMocks.mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [] }) // SELECT versions - none applied
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // migration sql
      .mockResolvedValueOnce({ rows: [] }) // INSERT schema_migrations
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const { initSchema } = await import('../../../packages/backend/src/db/migrations.js');
    await expect(initSchema()).resolves.toBeUndefined();
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('rollbackSchema 无需回滚时应直接返回', async () => {
    poolMocks.mockClient.query.mockResolvedValueOnce({
      rows: [{ version: 1 }],
    });
    const { rollbackSchema } = await import('../../../packages/backend/src/db/migrations.js');
    await expect(rollbackSchema(1)).resolves.toBeUndefined();
  });

  it('rollbackSchema 应执行 down 迁移', async () => {
    poolMocks.mockClient.query.mockResolvedValueOnce({ rows: [{ version: 1 }] });
    const { rollbackSchema } = await import('../../../packages/backend/src/db/migrations.js');
    await expect(rollbackSchema(0)).resolves.toBeUndefined();
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('BEGIN');
  });
});
