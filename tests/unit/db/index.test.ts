/**
 * api/db/index.ts 单元测试
 *
 * 覆盖连接池单例、只读池回退、initSchema/rollbackSchema/healthCheck/closeDb。
 * 使用 mock pg/fs，不依赖真实 PostgreSQL。
 */
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
}));

vi.mock('../../../api/config/index.js', () => ({ config: configMocks }));

import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../api/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../api/utils/metrics.js', () => ({
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

describe('db/index', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    configMocks.DATABASE_READ_URL = '';
    configMocks.NODE_ENV = 'test';
    vi.resetModules();
    poolMocks.primaryPool.connect.mockResolvedValue(poolMocks.mockClient);
    poolMocks.mockClient.query.mockResolvedValue({ rows: [] });
    poolMocks.primaryPool.query.mockResolvedValue({ rows: [{ ok: 1 }], rowCount: 1 });
  });

  afterEach(async () => {
    configMocks.NODE_ENV = 'test';
    configMocks.DATABASE_READ_URL = '';
    const mod = await import('../../../api/db/index.js');
    await mod.closeDb();
  });

  it('getPool 应返回单例并注册 connect/error 处理器', async () => {
    const { getPool } = await import('../../../api/db/index.js');
    const p1 = getPool();
    const p2 = getPool();
    expect(p1).toBe(p2);
    expect(poolMocks.Pool).toHaveBeenCalledTimes(1);
    expect(poolMocks.primaryPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(poolMocks.primaryPool.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('未配置 DATABASE_READ_URL 时 getReadPool 应回退主池', async () => {
    const { getPool, getReadPool } = await import('../../../api/db/index.js');
    expect(getReadPool()).toBe(getPool());
  });

  it('配置 DATABASE_READ_URL 时应创建独立只读池', async () => {
    configMocks.DATABASE_READ_URL = 'postgresql://read-replica/db';
    const { getReadPool } = await import('../../../api/db/index.js');
    const read = getReadPool();
    expect(read).toBe(poolMocks.readPoolInstance);
    expect(poolMocks.Pool).toHaveBeenCalledTimes(1);
    expect(poolMocks.Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: 'postgresql://read-replica/db' }),
    );
  });

  it('initSchema 在无待迁移时应跳过', async () => {
    poolMocks.mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [{ version: 8 }] }); // applied versions

    const { initSchema } = await import('../../../api/db/index.js');
    await expect(initSchema()).resolves.toBeUndefined();
    expect(poolMocks.mockClient.release).toHaveBeenCalled();
  });

  it('healthCheck 成功应返回 true', async () => {
    const { healthCheck } = await import('../../../api/db/index.js');
    await expect(healthCheck()).resolves.toBe(true);
  });

  it('healthCheck 失败应返回 false', async () => {
    poolMocks.primaryPool.query.mockRejectedValueOnce(new Error('db down'));
    const { healthCheck } = await import('../../../api/db/index.js');
    await expect(healthCheck()).resolves.toBe(false);
  });

  it('closeDb 应关闭主池与只读池', async () => {
    configMocks.DATABASE_READ_URL = 'postgresql://read-replica/db';
    const mod = await import('../../../api/db/index.js');
    mod.getPool();
    mod.getReadPool();
    await mod.closeDb();
    expect(poolMocks.primaryPool.end).toHaveBeenCalled();
    expect(poolMocks.readPoolInstance.end).toHaveBeenCalled();
  });

  it('rollbackSchema 无需回滚时应直接返回', async () => {
    poolMocks.mockClient.query.mockResolvedValueOnce({
      rows: [{ version: 3 }, { version: 2 }, { version: 1 }],
    });
    const { rollbackSchema } = await import('../../../api/db/index.js');
    await expect(rollbackSchema(5)).resolves.toBeUndefined();
  });

  it('initSchema 有待执行迁移时应执行 up SQL', async () => {
    poolMocks.mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [] }) // SELECT versions - none applied
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // migration sql
      .mockResolvedValueOnce({ rows: [] }) // INSERT schema_migrations
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const { initSchema } = await import('../../../api/db/index.js');
    await expect(initSchema()).resolves.toBeUndefined();
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('pool connect 事件应设置 statement_timeout', async () => {
    const { getPool } = await import('../../../api/db/index.js');
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
    const { getPool, closeDb } = await import('../../../api/db/index.js');
    getPool();
    expect(poolMocks.Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: true } }),
    );
    await closeDb();
    configMocks.NODE_ENV = 'test';
  });

  it('getClient 应从连接池获取 client', async () => {
    const { getClient } = await import('../../../api/db/index.js');
    const client = await getClient();
    expect(client).toBe(poolMocks.mockClient);
    expect(poolMocks.primaryPool.connect).toHaveBeenCalled();
  });

  it('rollbackSchema 应执行 down 迁移', async () => {
    poolMocks.mockClient.query
      .mockResolvedValueOnce({ rows: [{ version: 8 }, { version: 7 }, { version: 6 }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN v8
      .mockResolvedValueOnce({ rows: [] }) // down sql
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const { rollbackSchema } = await import('../../../api/db/index.js');
    await expect(rollbackSchema(7)).resolves.toBeUndefined();
    expect(poolMocks.mockClient.query).toHaveBeenCalledWith('BEGIN');
  });
});

