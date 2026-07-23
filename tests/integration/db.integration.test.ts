/**
 * PostgreSQL 集成测试（testcontainers）
 *
 * 企业理由：集成测试仅 CI 运行（依赖 GitHub Actions 服务容器），
 * 开发者本地无法验证 DB 交互逻辑。testcontainers 自动拉起
 * Docker 容器中的 PostgreSQL，使集成测试本地可运行。
 * 权衡：需要本地 Docker 环境，但比共享测试数据库更隔离、更可重现。
 *
 * 容器启动/Docker 检测/schema 初始化已抽至 tests/helpers/testcontainersPg.ts，
 * 与 6 个 SaaS 路由集成测试共享同一套容器管理逻辑。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createLoggerMocks } from '../helpers/mockFactories.js';
import { isDockerAvailable, setupTestContainer, type TestContainerContext } from '../helpers/testcontainersPg.js';

// Mock logger 打破 config ↔ logger 循环依赖，
// 避免 config 模块加载时 logger 引用 config 导致 undefined
vi.mock('../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

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
    // 回滚到 v2，仅撤销 v3（index_cleanup）的变更
    await rollbackSchema(2);
    const pool = getPool();
    // v3 的 down 文件删除了 CHECK 约束和冗余索引，
    // 验证 schema_migrations 中 v3 已被移除
    const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const versions = rows.map((r: { version: number }) => r.version);
    expect(versions).not.toContain(3);
    expect(versions).toContain(2);
    expect(versions).toContain(1);
  });

  it('应成功重新应用迁移（down→up 循环）', async () => {
    // 当前在 v2，回滚到 v1，再重新迁移到最新
    await rollbackSchema(1);
    await initSchema();
    const pool = getPool();
    const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const versions = rows.map((r: { version: number }) => r.version);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const isHealthy = await healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('CHECK 约束应拒绝非法数据', async () => {
    await initSchema();
    const pool = getPool();
    // 先插入一个 ticker
    await pool.query(
      "INSERT INTO tickers (ticker, category, market) VALUES ('TEST', 'test', 'test') ON CONFLICT DO NOTHING",
    );

    // 尝试插入 high < low 的非法数据
    await expect(
      pool.query(
        "INSERT INTO prices (ticker, date, open, high, low, close, volume) VALUES ('TEST', '2024-01-01', 100, 90, 110, 105, 1000)",
      ),
    ).rejects.toThrow('prices_ohlc_check');

    // 尝试插入 volume < 0 的非法数据（v8 chk_prices_volume_nonnegative）
    await expect(
      pool.query(
        "INSERT INTO prices (ticker, date, open, high, low, close, volume) VALUES ('TEST', '2024-01-02', 100, 110, 90, 105, -1)",
      ),
    ).rejects.toThrow(/chk_prices_volume_nonnegative|prices_ohlc_check/);

    // 合法数据应成功插入
    await expect(
      pool.query(
        "INSERT INTO prices (ticker, date, open, high, low, close, volume) VALUES ('TEST', '2024-01-01', 100, 110, 90, 105, 1000)",
      ),
    ).resolves.toBeDefined();
  });
});
