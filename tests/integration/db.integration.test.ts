/**
 * PostgreSQL 集成测试（testcontainers）
 *
 * 企业理由：集成测试仅 CI 运行（依赖 GitHub Actions 服务容器），
 * 开发者本地无法验证 DB 交互逻辑。testcontainers 自动拉起
 * Docker 容器中的 PostgreSQL，使集成测试本地可运行。
 * 权衡：需要本地 Docker 环境，但比共享测试数据库更隔离、更可重现。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';

// Mock logger 打破 config ↔ logger 循环依赖，
// 避免 config 模块加载时 logger 引用 config 导致 undefined
vi.mock('../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

import { config } from '../../packages/backend/src/config/index.js';
import { initSchema, rollbackSchema } from '../../packages/backend/src/db/migrations.js';
import { getPool, closeDb, healthCheck } from '../../packages/backend/src/db/pool.js';

// Docker 可用性检查：testcontainers 依赖 Docker 守护进程
// 通过执行 `docker info` 检测，失败则跳过整个测试套件
let dockerAvailable = false;
try {
  execSync('docker info', { stdio: 'ignore', timeout: 5000 });
  dockerAvailable = true;
} catch {
  dockerAvailable = false;
}

describe.skipIf(!dockerAvailable)('PostgreSQL 集成测试（testcontainers）', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    // 启动 PostgreSQL 容器
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('backtest_test')
      .withUsername('backtest')
      .withPassword('backtest')
      .start();

    // config.DATABASE_URL 在模块加载时已从 process.env 读取，
    // 此处需同时覆盖 config 对象和环境变量，确保 getPool() 使用容器连接串
    const connectionString = container.getConnectionUri();
    process.env.DATABASE_URL = connectionString;
    (config as { DATABASE_URL: string }).DATABASE_URL = connectionString;
    await closeDb();
  }, 60000);

  afterAll(async () => {
    await closeDb();
    await container.stop();
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
