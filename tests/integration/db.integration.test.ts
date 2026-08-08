import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { loggerMocks } from '../helpers/loggerFixture.js';
import {
  isDockerAvailable,
  setupTestContainer,
  type TestContainerContext,
} from '../helpers/testcontainersPg.js';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));

import { initSchema, rollbackSchema } from '../../packages/backend/src/db/migrations.js';
import { getPool, healthCheck } from '../../packages/backend/src/db/pool.js';

const dockerAvailable = isDockerAvailable();

describe.skipIf(!dockerAvailable)('PostgreSQL 集成测试（testcontainers）', () => {
  let ctx: TestContainerContext;

  beforeAll(async () => {
    ctx = await setupTestContainer();
  }, 60000);

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('应成功初始化 schema', async () => {
    await initSchema();
    const isHealthy = await healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('应成功回滚到指定版本（v3→v2）', async () => {
    await rollbackSchema(2);
    const pool = getPool();
    const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const versions = rows.map((r: { version: number }) => r.version);
    expect(versions).not.toContain(3);
    expect(versions).toContain(2);
    expect(versions).toContain(1);
  });

  it('应成功重新应用迁移（down→up 循环）', async () => {
    await rollbackSchema(1);
    await initSchema();
    const pool = getPool();
    const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const versions = rows.map((r: { version: number }) => r.version);
    expect(versions).toEqual([1, 2]);
    const isHealthy = await healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('CHECK 约束应拒绝非法数据', async () => {
    await initSchema();
    const pool = getPool();
    await pool.query(
      "INSERT INTO tickers (ticker, category, market) VALUES ('TEST', 'test', 'test') ON CONFLICT DO NOTHING",
    );

    await expect(
      pool.query(
        "INSERT INTO prices (ticker, date, open, high, low, close, volume) VALUES ('TEST', '2024-01-01', 100, 90, 110, 105, 1000)",
      ),
    ).rejects.toThrow('prices_ohlc_check');

    await expect(
      pool.query(
        "INSERT INTO prices (ticker, date, open, high, low, close, volume) VALUES ('TEST', '2024-01-02', 100, 110, 90, 105, -1)",
      ),
    ).rejects.toThrow(/chk_prices_volume_nonnegative|prices_ohlc_check/);

    await expect(
      pool.query(
        "INSERT INTO prices (ticker, date, open, high, low, close, volume) VALUES ('TEST', '2024-01-01', 100, 110, 90, 105, 1000)",
      ),
    ).resolves.toBeDefined();
  });
});
