import '../helpers/loggerMock.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerAvailable,
  setupTestContainer,
  type TestContainerContext,
} from '../helpers/testcontainersPg.js';

import { initSchema } from '../../packages/backend/src/db/migrations.js';
import { getPool, closeDb } from '../../packages/backend/src/db/pool.js';
import { config } from '../../packages/backend/src/config/index.js';

const dockerAvailable = isDockerAvailable();

describe.skipIf(!dockerAvailable)('PostgreSQL 集成测试（testcontainers）', () => {
  let ctx: TestContainerContext;

  beforeAll(async () => {
    ctx = await setupTestContainer();
    // 迁移/回滚为 DDL（DROP TABLE 等），需以表属主超管执行
    config.DATABASE_URL = ctx.adminConnectionString;
    await closeDb();
  }, 300000);

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('应成功初始化 schema', async () => {
    await initSchema();
    await expect(getPool().query('SELECT 1')).resolves.toBeDefined();
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
